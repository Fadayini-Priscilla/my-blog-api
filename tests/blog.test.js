const request = require('supertest');
const app = require('../app2');
const mongoose = require('mongoose');
const User = require('../models/User');
const Blog = require('../models/Blog');

const MONGODB_TEST_URI = 'mongodb://localhost:27017/blogging_db_test';

let server;
let authToken;
let userId;

beforeAll(async () => {
    // Connect to the test database only if not already connected
    if (mongoose.connection.readyState === 0) { // 0 = disconnected
        await mongoose.connect(MONGODB_TEST_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Test Connection Opened for Blog Tests');
    }

    // Register and login a user to get an auth token for protected routes
    // Clear users before creating to ensure a clean state for the test user setup
    await User.deleteMany({});
    const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
            first_name: 'Test',
            last_name: 'User',
            email: 'test@example.com',
            password: 'testpassword'
        });

    // Added more explicit check for successful registration
    if (registerRes.statusCode !== 201 || !registerRes.body.token) {
        console.error('Registration failed in beforeAll for blog.test.js.');
        console.error('Response Status:', registerRes.statusCode);
        console.error('Response Body:', registerRes.body);
        throw new Error('Failed to obtain auth token in beforeAll for blog.test.js due to registration failure.');
    }

    authToken = registerRes.body.token;
    userId = registerRes.body._id;
    console.log('Auth Token obtained for blog.test.js:', authToken ? 'Token present' : 'Token missing');
});

beforeEach(async () => {
    // Clear blogs before each test, but keep the test user
    await Blog.deleteMany({});
});

afterAll(async () => {
});

describe('Blog Endpoints', () => {
    // Helper to generate a unique title for each test to avoid conflicts
    const generateUniqueTitle = (prefix = 'Test Blog') => {
        return `${prefix} - ${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    };

    // Test data for blog creation
    const getBlogData = (titleSuffix = '') => ({
        title: generateUniqueTitle(titleSuffix ? `My Blog Post ${titleSuffix}` : 'My First Blog Post'),
        description: 'This is a test description.',
        tags: ['test', 'nodejs'],
        body: 'This is the main content of my first blog post. It is quite long to test reading time calculation. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    });

    it('should create a new blog post (draft by default)', async () => {
        const blogData = getBlogData(); // Get a unique title for this test
        const res = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(blogData);

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('_id');
        expect(res.body.title).toEqual(blogData.title);
        expect(res.body.author.toString()).toEqual(userId);
        expect(res.body.state).toEqual('draft'); // Should be draft by default
        expect(res.body.reading_time).toBeGreaterThan(0); // Should be calculated
    });

    it('should not create a blog with a duplicate title for the same author', async () => {
        const uniqueBlogTitle = generateUniqueTitle('Duplicate Title Check');
        const blogDataFirst = getBlogData();
        blogDataFirst.title = uniqueBlogTitle;

        // First create the blog
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(blogDataFirst);

        // Try creating again with the same title by the same author
        const blogDataSecond = getBlogData();
        blogDataSecond.title = uniqueBlogTitle; // Intentionally use the same title
        const res = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(blogDataSecond);

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toEqual('You already have a blog with this title.');
    });

    it('should get all published blogs (publicly accessible)', async () => {
        // Create a draft blog (should not appear in public list)
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('Draft Blog'));

        // Create and publish another blog
        const publishedBlogData = getBlogData('Published Blog A');
        publishedBlogData.state = 'published';
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(publishedBlogData);

        // Get all published blogs
        const res = await request(app)
            .get('/api/blogs');

        expect(res.statusCode).toEqual(200);
        expect(res.body.blogs).toBeInstanceOf(Array);
        expect(res.body.blogs.length).toBeGreaterThanOrEqual(1);
        expect(res.body.blogs[0].state).toEqual('published');
        // Check if the draft blog title is NOT present
        expect(res.body.blogs.some(blog => blog.title.includes('Draft Blog'))).toBeFalsy();
        // Check if the published blog title IS present
        expect(res.body.blogs.some(blog => blog.title.includes('Published Blog A'))).toBeTruthy();
    });

    it('should get a single published blog by ID and increment read_count', async () => {
        // Create and publish a blog
        const publishedBlogData = getBlogData('Single Published Blog');
        publishedBlogData.state = 'published';
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(publishedBlogData);
        const blogId = createRes.body._id;

        // Get the blog
        const res = await request(app)
            .get(`/api/blogs/${blogId}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.title).toEqual(publishedBlogData.title);
        expect(res.body.read_count).toEqual(1); // Should be incremented
        expect(res.body).toHaveProperty('author'); // Should be populated
        expect(res.body.author).toHaveProperty('email');

        // Get it again to confirm read_count increments
        const res2 = await request(app)
            .get(`/api/blogs/${blogId}`);
        expect(res2.statusCode).toEqual(200);
        expect(res2.body.read_count).toEqual(2);
    });

    it('should not get a draft blog by ID publicly', async () => {
        // Create a draft blog
        const draftBlogData = getBlogData('Draft Blog for Test');
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(draftBlogData);
        const blogId = createRes.body._id;

        // Try to get the draft blog publicly
        const res = await request(app)
            .get(`/api/blogs/${blogId}`);

        expect(res.statusCode).toEqual(404);
        expect(res.body.message).toEqual('Blog not found or not published');
    });

    it('should get all blogs by the logged-in user (my-blogs)', async () => {
        // Create a draft blog
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('My Draft Blog'));

        // Create and publish another blog by the same user
        const publishedBlogData = getBlogData('My Published Blog');
        publishedBlogData.state = 'published';
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(publishedBlogData);

        // Get my blogs
        const res = await request(app)
            .get('/api/blogs/my-blogs')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.blogs).toBeInstanceOf(Array);
        expect(res.body.blogs.length).toEqual(2); // Both draft and published
        expect(res.body.blogs.some(blog => blog.title.includes('My Draft Blog'))).toBeTruthy();
        expect(res.body.blogs.some(blog => blog.title.includes('My Published Blog'))).toBeTruthy();
    });

    it('should filter my blogs by state (draft)', async () => {
        // Create a draft blog
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('Filtered Draft Blog'));

        // Create and publish another blog by the same user
        const publishedBlogData = getBlogData('Filtered Published Blog');
        publishedBlogData.state = 'published';
        await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(publishedBlogData);

        // Get my blogs filtered by draft
        const res = await request(app)
            .get('/api/blogs/my-blogs?state=draft')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.blogs.length).toEqual(1);
        expect(res.body.blogs[0].title).toEqual(expect.stringContaining('Filtered Draft Blog'));
        expect(res.body.blogs[0].state).toEqual('draft');
    });

    it('should update a blog post', async () => {
        // Create a blog
        const initialBlogData = getBlogData('Original Blog Title');
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(initialBlogData);
        const blogId = createRes.body._id;

        const updatedData = {
            title: generateUniqueTitle('Updated Blog Title'), // New unique title
            description: 'New description.',
            body: initialBlogData.body, // Include the body field
            state: 'published'
        };

        const res = await request(app)
            .put(`/api/blogs/${blogId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send(updatedData);

        expect(res.statusCode).toEqual(200);
        expect(res.body.title).toEqual(updatedData.title);
        expect(res.body.description).toEqual(updatedData.description);
        expect(res.body.state).toEqual('published');
        expect(res.body.body).toEqual(initialBlogData.body); // Ensure body is still there
    });

    it('should update only the state of a blog post', async () => {
        // Create a blog
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('State Change Blog'));
        const blogId = createRes.body._id;

        const res = await request(app)
            .patch(`/api/blogs/${blogId}/state`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ state: 'published' });

        expect(res.statusCode).toEqual(200);
        expect(res.body.state).toEqual('published');
        expect(res.body.title).toEqual(expect.stringContaining('State Change Blog')); // Title should remain unchanged
    });

    it('should not update a blog post if not the owner', async () => {
        // Create a blog with the current user
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('Owner Check Blog'));
        const blogId = createRes.body._id;

        // Register another user
        await User.deleteMany({ email: 'another@example.com' }); // Clear previous
        const anotherUserRes = await request(app)
            .post('/api/auth/register')
            .send({
                first_name: 'Another',
                last_name: 'User',
                email: 'another@example.com',
                password: 'anotherpassword'
            });
        const anotherUserToken = anotherUserRes.body.token;

        // Try to update with another user's token
        const res = await request(app)
            .put(`/api/blogs/${blogId}`)
            .set('Authorization', `Bearer ${anotherUserToken}`)
            .send({ title: 'Attempted Update by Other User', body: 'Some body content' }); // Include body for validation

        expect(res.statusCode).toEqual(403);
        expect(res.body.message).toEqual('Not authorized to update this blog');
    });

    it('should delete a blog post', async () => {
        // Create a blog
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('Blog to Delete'));
        const blogId = createRes.body._id;

        const res = await request(app)
            .delete(`/api/blogs/${blogId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toEqual('Blog removed');

        // Verify it's deleted
        const checkRes = await request(app)
            .get(`/api/blogs/${blogId}`);
        expect(checkRes.statusCode).toEqual(404); // Should not be found publicly

        const checkMyBlogsRes = await request(app)
            .get('/api/blogs/my-blogs')
            .set('Authorization', `Bearer ${authToken}`);
        expect(checkMyBlogsRes.body.blogs.some(blog => blog._id === blogId)).toBeFalsy(); // Should not be in my blogs
    });

    it('should not delete a blog post if not the owner', async () => {
        // Create a blog with the current user
        const createRes = await request(app)
            .post('/api/blogs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(getBlogData('Blog Not Owner'));
        const blogId = createRes.body._id;

        // Register another user
        await User.deleteMany({ email: 'third@example.com' });
        const thirdUserRes = await request(app)
            .post('/api/auth/register')
            .send({
                first_name: 'Third',
                last_name: 'User',
                email: 'third@example.com',
                password: 'thirdpassword'
            });
        const thirdUserToken = thirdUserRes.body.token;

        // Try to delete with another user's token
        const res = await request(app)
            .delete(`/api/blogs/${blogId}`)
            .set('Authorization', `Bearer ${thirdUserToken}`);

        expect(res.statusCode).toEqual(403);
        expect(res.body.message).toEqual('Not authorized to delete this blog');
    });

    it('should handle pagination for published blogs', async () => {
        // Create multiple published blogs with unique titles
        for (let i = 0; i < 25; i++) {
            await request(app)
                .post('/api/blogs')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ ...getBlogData(`Pagination Blog ${i}`), state: 'published', body: `Content ${i}` });
        }

        // Get first page (default 20)
        const res1 = await request(app).get('/api/blogs?page=1');
        expect(res1.statusCode).toEqual(200);
        expect(res1.body.blogs.length).toEqual(20);
        expect(res1.body.totalPages).toEqual(2);
        expect(res1.body.currentPage).toEqual(1);

        // Get second page
        const res2 = await request(app).get('/api/blogs?page=2');
        expect(res2.statusCode).toEqual(200);
        expect(res2.body.blogs.length).toEqual(5);
        expect(res2.body.totalPages).toEqual(2);
        expect(res2.body.currentPage).toEqual(2);
    });

    it('should search published blogs by title', async () => {
        await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Unique Tech Blog'), title: generateUniqueTitle('Unique Tech Blog'), state: 'published' });
        await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Another Article about Tech'), title: generateUniqueTitle('Another Article about Tech'), state: 'published' });
        await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Science Fiction'), title: generateUniqueTitle('Science Fiction'), state: 'published' });

        const res = await request(app).get('/api/blogs?title=Tech'); // Search case-insensitively
        expect(res.statusCode).toEqual(200);
        expect(res.body.blogs.length).toEqual(2);
        expect(res.body.blogs.map(b => b.title)).toEqual(expect.arrayContaining([
            expect.stringContaining('Unique Tech Blog'),
            expect.stringContaining('Another Article about Tech')
        ]));
    });

    it('should search published blogs by tags', async () => {
        await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('JavaScript Basics'), tags: ['programming', 'frontend', 'js'], state: 'published' });
        await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Node.js Essentials'), tags: ['programming', 'backend', 'nodejs'], state: 'published' });
        await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Random Post'), tags: ['general'], state: 'published' });

        const res = await request(app).get('/api/blogs?tags=programming,js');
        expect(res.statusCode).toEqual(200);
        expect(res.body.blogs.length).toEqual(2);
        expect(res.body.blogs.map(b => b.title)).toEqual(expect.arrayContaining([
            expect.stringContaining('JavaScript Basics'),
            expect.stringContaining('Node.js Essentials')
        ]));
    });

    it('should order published blogs by read_count (descending)', async () => {
        // Create blogs with different read counts
        const blog1Res = await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Blog A'), state: 'published' });
        const blog2Res = await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Blog B'), state: 'published' });
        const blog3Res = await request(app).post('/api/blogs').set('Authorization', `Bearer ${authToken}`).send({ ...getBlogData('Blog C'), state: 'published' });

        // Increment read counts
        await request(app).get(`/api/blogs/${blog3Res.body._id}`); // blog C: 1 read
        await request(app).get(`/api/blogs/${blog2Res.body._id}`); // blog B: 1 read
        await request(app).get(`/api/blogs/${blog2Res.body._id}`); // blog B: 2 reads
        await request(app).get(`/api/blogs/${blog1Res.body._id}`); // blog A: 1 read
        await request(app).get(`/api/blogs/${blog1Res.body._id}`); // blog A: 2 reads
        await request(app).get(`/api/blogs/${blog1Res.body._id}`); // blog A: 3 reads

        const res = await request(app).get('/api/blogs?order_by=read_count:desc');
        expect(res.statusCode).toEqual(200);
        expect(res.body.blogs.length).toEqual(3);
        // We need to check based on the actual titles (which are now unique)
        expect(res.body.blogs[0].title).toEqual(expect.stringContaining('Blog A')); // 3 reads
        expect(res.body.blogs[1].title).toEqual(expect.stringContaining('Blog B')); // 2 reads
        expect(res.body.blogs[2].title).toEqual(expect.stringContaining('Blog C')); // 1 read
    });
});
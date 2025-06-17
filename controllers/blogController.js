const Blog = require('../models/Blog');
const User = require('../models/User'); // Import User model to search by author name
const Joi = require('joi');

// Joi schema for blog creation/update validation
const blogSchema = Joi.object({
    title: Joi.string().trim().required(),
    description: Joi.string().trim().allow(''), // Description can be empty
    tags: Joi.array().items(Joi.string().trim()).default([]),
    body: Joi.string().required(),
    state: Joi.string().valid('draft', 'published').default('draft') // Only allow 'draft' or 'published'
});

// @desc    Create a new blog post
// @route   POST /api/blogs
// @access  Private
const createBlog = async (req, res) => {
    try {
        const { error } = blogSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        // Destructure 'state' from req.body as well
        const { title, description, tags, body, state } = req.body; 

        // Check if a blog with the same title already exists for this author
        const existingBlog = await Blog.findOne({ title, author: req.user._id });
        if (existingBlog) {
            return res.status(400).json({ message: 'You already have a blog with this title.' });
        }

        const blog = await Blog.create({
            title,
            description,
            tags,
            body,
            author: req.user._id, // Author is the logged-in user
            state: state || 'draft' // Use provided state or default to 'draft'
        });

        res.status(201).json(blog);
    } catch (error) {
        console.error(error);
        // Handle unique title constraint if not caught by the check above (e.g., race condition)
        if (error.code === 11000) { // Duplicate key error
            return res.status(400).json({ message: 'A blog with this title already exists globally. Please choose a different title.' });
        }
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all published blogs (publicly accessible)
// @route   GET /api/blogs
// @access  Public
const getPublishedBlogs = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Default 20 blogs per page
    const skip = (page - 1) * limit;

    const query = { state: 'published' };
    const { author, title, tags, order_by } = req.query;

    if (author) {
        // This assumes 'author' query parameter is the author's name
        // You can adjust this to search by author ID or require an exact match
        const users = await User.find({
            $or: [
                { first_name: { $regex: author, $options: 'i' } },
                { last_name: { $regex: author, $options: 'i' } }
            ]
        }).select('_id');
        const authorIds = users.map(user => user._id);
        if (authorIds.length > 0) {
            query.author = { $in: authorIds };
        } else {
            // If no users match the author name, return empty array rather than failing the query
            return res.status(200).json({ blogs: [], totalPages: 0, currentPage: page });
        }
    }
    if (title) {
        query.title = { $regex: title, $options: 'i' }; // Case-insensitive title search
    }
    if (tags) {
        // Supports multiple tags separated by comma, e.g., ?tags=tech,programming
        const tagArray = tags.split(',').map(tag => tag.trim());
        query.tags = { $in: tagArray };
    }

    let sortOptions = {};
    if (order_by) {
        const [field, direction] = order_by.split(':'); // e.g., "read_count:desc"
        if (['read_count', 'reading_time', 'createdAt'].includes(field)) {
            sortOptions[field === 'createdAt' ? 'timestamp' : field] = direction === 'asc' ? 1 : -1;
        }
    } else {
        sortOptions.createdAt = -1; // Default sort by newest first
    }


    try {
        const blogs = await Blog.find(query)
            .populate('author', 'first_name last_name email') // Get author's name and email
            .sort(sortOptions)
            .skip(skip)
            .limit(limit);

        const totalBlogs = await Blog.countDocuments(query);
        const totalPages = Math.ceil(totalBlogs / limit);

        res.json({
            blogs,
            totalPages,
            currentPage: page
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};


// @desc    Get a single published blog by ID
// @route   GET /api/blogs/:id
// @access  Public
const getPublishedBlogById = async (req, res) => {
    try {
        const blog = await Blog.findOne({ _id: req.params.id, state: 'published' }).populate('author', 'first_name last_name email');

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found or not published' });
        }

        // Increment read_count
        blog.read_count += 1;
        await blog.save();

        res.json(blog);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all blogs by the logged-in user (draft and published)
// @route   GET /api/blogs/my-blogs
// @access  Private
const getMyBlogs = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { author: req.user._id };
    const { state } = req.query;

    if (state && ['draft', 'published'].includes(state)) {
        query.state = state;
    }

    console.log('getMyBlogs query:', query); // Debugging: Log the query being used
    try {
        const blogs = await Blog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        console.log('Blogs found by getMyBlogs:', blogs.map(b => ({ title: b.title, state: b.state }))); // Debugging: Log the blogs found
        const totalBlogs = await Blog.countDocuments(query);
        const totalPages = Math.ceil(totalBlogs / limit);

        res.json({
            blogs,
            totalPages,
            currentPage: page
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update a blog post (state, content)
// @route   PUT /api/blogs/:id
// @access  Private (Owner only)
const updateBlog = async (req, res) => {
    try {
        console.log('--- Inside updateBlog controller ---');
        console.log('Request Params ID:', req.params.id);
        console.log('Request Body:', req.body);
        console.log('Authenticated User ID (req.user._id):', req.user ? req.user._id.toString() : 'N/A');

        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            console.log('Blog not found with ID:', req.params.id);
            return res.status(404).json({ message: 'Blog not found' });
        }
        console.log('Found Blog (before update):', {
            _id: blog._id.toString(),
            title: blog.title,
            author: blog.author.toString(),
            state: blog.state
        });


        // Ensure the logged-in user is the author of the blog
        if (blog.author.toString() !== req.user._id.toString()) {
            console.log('Authorization failed: User is not the author.');
            return res.status(403).json({ message: 'Not authorized to update this blog' });
        }

        const { error } = blogSchema.validate(req.body, { abortEarly: false, allowUnknown: true }); // allowUnknown for state updates alone
        if (error) {
            console.log('Validation Error:', error.details);
            return res.status(400).json({ message: error.details[0].message });
        }

        const { title, description, tags, body, state } = req.body;

        if (title) blog.title = title;
        if (description !== undefined) blog.description = description; // Allow empty string
        if (tags) blog.tags = tags;
        if (body) blog.body = body;
        if (state) blog.state = state; // Only update state if provided

        const updatedBlog = await blog.save();
        console.log('Blog updated successfully:', {
            _id: updatedBlog._id.toString(),
            title: updatedBlog.title,
            state: updatedBlog.state
        });
        res.json(updatedBlog);
    } catch (error) {
        console.error('Error in updateBlog:', error);
        // Handle unique title constraint if update changes title to an existing one
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A blog with this title already exists. Please choose a different title.' });
        }
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update blog state (draft/published)
// @route   PATCH /api/blogs/:id/state
// @access  Private (Owner only)
const updateBlogState = async (req, res) => {
    try {
        const { state } = req.body;

        if (!state || !['draft', 'published'].includes(state)) {
            return res.status(400).json({ message: 'Invalid state provided. Must be "draft" or "published".' });
        }

        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        // Ensure the logged-in user is the author of the blog
        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this blog\'s state' });
        }

        blog.state = state;
        const updatedBlog = await blog.save();
        res.json(updatedBlog);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};


// @desc    Delete a blog post
// @route   DELETE /api/blogs/:id
// @access  Private (Owner only)
const deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        // Ensure the logged-in user is the author of the blog
        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this blog' });
        }

        await Blog.deleteOne({ _id: req.params.id }); // Using deleteOne with query
        res.status(200).json({ message: 'Blog removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    createBlog,
    getPublishedBlogs,
    getPublishedBlogById,
    getMyBlogs,
    updateBlog,
    updateBlogState,
    deleteBlog
};
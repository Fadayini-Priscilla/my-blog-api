const request = require('supertest');
const app = require('../app2'); // Your Express app
const mongoose = require('mongoose');
const User = require('../models/User');

// Use a separate test database
const MONGODB_TEST_URI = 'mongodb://localhost:27017/blogging_db_test';

let server;

beforeAll(async () => {
    // Connect to the test database only if not already connected
    if (mongoose.connection.readyState === 0) { // 0 = disconnected
        await mongoose.connect(MONGODB_TEST_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Test Connection Opened for Auth Tests');
    }
});

beforeEach(async () => {
    // Clear the database before each test
    await User.deleteMany({});
});

afterAll(async () => {
});

describe('Auth Endpoints', () => {
    let testUser = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        password: 'password123'
    };

    it('should register a new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('_id');
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toEqual(testUser.email);
        expect(res.body).not.toHaveProperty('password'); // Password should not be returned
    });

    it('should not register a user with an existing email', async () => {
        // First register the user
        await request(app)
            .post('/api/auth/register')
            .send(testUser);

        // Try to register again with the same email
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toEqual('User with that email already exists');
    });

    it('should log in an existing user and return a token', async () => {
        // Register the user first
        await request(app)
            .post('/api/auth/register')
            .send(testUser);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: testUser.password
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toEqual(testUser.email);
    });

    it('should not log in with incorrect password', async () => {
        // Register the user first
        await request(app)
            .post('/api/auth/register')
            .send(testUser);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: 'wrongpassword'
            });

        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toEqual('Invalid credentials');
    });

    it('should get user profile with a valid token', async () => {
        // Register and login to get a token
        const registerRes = await request(app)
            .post('/api/auth/register')
            .send(testUser);
        const token = registerRes.body.token;

        const profileRes = await request(app)
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${token}`);

        expect(profileRes.statusCode).toEqual(200);
        expect(profileRes.body.email).toEqual(testUser.email);
        expect(profileRes.body).not.toHaveProperty('password');
    });

    it('should not get user profile without a token', async () => {
        const res = await request(app)
            .get('/api/auth/profile');

        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toEqual('Not authorized, no token');
    });

    it('should not get user profile with an invalid token', async () => {
        const res = await request(app)
            .get('/api/auth/profile')
            .set('Authorization', 'Bearer invalidtoken');

        expect(res.statusCode).toEqual(401);
        expect(res.body.message).toEqual('Not authorized, token failed or expired');
    });
});
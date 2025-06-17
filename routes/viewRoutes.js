const express = require('express');
const router = express.Router();

// Public views
router.get('/', (req, res) => {
    res.render('blogs/index', { title: 'All Published Blogs' });
});

router.get('/register', (req, res) => {
    res.render('auth/register', { title: 'Register' });
});

router.get('/login', (req, res) => {
    res.render('auth/login', { title: 'Login' });
});

// Example of a protected view (needs client-side JWT handling)
router.get('/create-blog', (req, res) => {
    // In a real app, you'd check for a token in cookies/session here
    res.render('blogs/create', { title: 'Create New Blog' });
});

router.get('/my-blogs', (req, res) => {
    res.render('blogs/my-blogs', { title: 'My Blogs' });
});

router.get('/edit-blog/:id', (req, res) => {
    res.render('blogs/edit', { title: 'Edit Blog', blogId: req.params.id });
});

router.get('/blog/:id', (req, res) => {
    res.render('blogs/show', { title: 'View Blog', blogId: req.params.id });
});


module.exports = router;
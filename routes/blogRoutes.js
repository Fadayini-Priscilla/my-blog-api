const express = require('express');
const {
    createBlog,
    getPublishedBlogs,
    getPublishedBlogById,
    getMyBlogs,
    updateBlog,
    updateBlogState,
    deleteBlog
} = require('../controllers/blogController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// Private routes for authenticated users - More specific routes first!
router.get('/my-blogs', protect, getMyBlogs); // Get blogs by the logged-in user
router.post('/', protect, createBlog); // Create a new blog
router.put('/:id', protect, updateBlog); // Update a blog (full update)
router.patch('/:id/state', protect, updateBlogState); // Update blog state only
router.delete('/:id', protect, deleteBlog); // Delete a blog

// Public routes for published blogs - General routes come after specific ones
router.get('/', getPublishedBlogs); // List all published blogs, with search/filter/pagination
router.get('/:id', getPublishedBlogById); // Get a single published blog

module.exports = router;

require('dotenv').config(); // Load environment variables
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const viewRoutes = require('./routes/viewRoutes'); // For EJS views

const app = express();

// Connect to database
connectDB();

// Middleware
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// EJS setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', './layouts/main'); // Default layout for all views
app.set('views', './views'); // Specify the views directory

// Serve static files
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes); // API routes for authentication
app.use('/api/blogs', blogRoutes); // API routes for blogs
app.use('/', viewRoutes); // Routes for serving EJS pages

// Basic Error Handling (add more robust error handling as needed)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Server running at http://localhost:${PORT}/`);
});


module.exports = app; // Export app for testing
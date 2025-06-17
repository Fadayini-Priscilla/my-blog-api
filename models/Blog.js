const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    state: {
        type: String,
        enum: ['draft', 'published'],
        default: 'draft'
    },
    read_count: {
        type: Number,
        default: 0
    },
    reading_time: {
        type: Number, // In minutes
        default: 0
    },
    tags: [{
        type: String,
        trim: true
    }],
    body: {
        type: String,
        required: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt fields
});

// Algorithm for calculating reading_time (approx. 200 words per minute)
BlogSchema.pre('save', function (next) {
    if (this.isModified('body') || this.isNew) {
        const wordsPerMinute = 200;
        const wordCount = this.body.split(/\s+/).length;
        this.reading_time = Math.ceil(wordCount / wordsPerMinute);
    }
    next();
});

module.exports = mongoose.model('Blog', BlogSchema);
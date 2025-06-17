const API_BASE_URL = '/api';

// --- Utility Functions ---
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    } : {
        'Content-Type': 'application/json'
    };
}

function displayMessage(elementId, message, isError = false) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = isError ? 'message error' : 'message';
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000); // Hide after 5 seconds
    }
}

function isLoggedIn() {
    return localStorage.getItem('token') !== null;
}

function updateNav() {
    const loginLink = document.querySelector('nav ul li a[href="/login"]');
    const registerLink = document.querySelector('nav ul li a[href="/register"]');
    const createBlogLink = document.querySelector('nav ul li a[href="/create-blog"]');
    const myBlogsLink = document.querySelector('nav ul li a[href="/my-blogs"]');
    const logoutBtn = document.getElementById('logout-btn');

    if (isLoggedIn()) {
        if (loginLink) loginLink.style.display = 'none';
        if (registerLink) registerLink.style.display = 'none';
        if (createBlogLink) createBlogLink.style.display = 'inline-block';
        if (myBlogsLink) myBlogsLink.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        if (loginLink) loginLink.style.display = 'inline-block';
        if (registerLink) registerLink.style.display = 'inline-block';
        if (createBlogLink) createBlogLink.style.display = 'none';
        if (myBlogsLink) myBlogsLink.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

// --- Authentication Handlers ---
async function handleRegister(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (response.ok) {
            displayMessage('register-message', 'Registration successful! You can now login.', false);
            form.reset();
            // Optionally redirect to login or auto-login
            window.location.href = '/login';
        } else {
            displayMessage('register-message', result.message || 'Registration failed', true);
        }
    } catch (error) {
        console.error('Error during registration:', error);
        displayMessage('register-message', 'Network error or server unavailable', true);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (response.ok) {
            localStorage.setItem('token', result.token);
            displayMessage('login-message', 'Login successful!', false);
            updateNav();
            window.location.href = '/'; // Redirect to home page
        } else {
            displayMessage('login-message', result.message || 'Login failed', true);
        }
    } catch (error) {
        console.error('Error during login:', error);
        displayMessage('login-message', 'Network error or server unavailable', true);
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    updateNav();
    window.location.href = '/login'; // Redirect to login page
}

// --- Blog Handlers ---

let currentPage = 1;
let totalPages = 1;
let currentFilters = {};

async function fetchBlogs(page = 1, filters = {}, targetElementId = 'blogs-list', isMyBlogs = false) {
    let url = `${API_BASE_URL}/blogs?page=${page}`;
    if (isMyBlogs) {
        url = `${API_BASE_URL}/blogs/my-blogs?page=${page}`;
    }

    // Add filters to URL
    for (const key in filters) {
        if (filters[key]) {
            url += `&${key}=${encodeURIComponent(filters[key])}`;
        }
    }

    try {
        const headers = isMyBlogs ? getAuthHeaders() : { 'Content-Type': 'application/json' };
        const response = await fetch(url, { headers });
        const result = await response.json();

        if (response.ok) {
            const blogsListDiv = document.getElementById(targetElementId);
            blogsListDiv.innerHTML = ''; // Clear previous blogs

            if (result.blogs && result.blogs.length > 0) {
                result.blogs.forEach(blog => {
                    const blogCard = document.createElement('div');
                    blogCard.className = 'blog-card';
                    blogCard.innerHTML = `
                        <h3><a href="/blog/${blog._id}">${blog.title}</a></h3>
                        <div class="meta-info">
                            <span>By ${blog.author ? `${blog.author.first_name} ${blog.author.last_name}` : 'Unknown Author'}</span>
                            <span>${new Date(blog.createdAt).toLocaleDateString()}</span>
                            <span>${blog.reading_time} min read</span>
                            <span>${blog.read_count} reads</span>
                        </div>
                        <p>${blog.description || 'No description available.'}</p>
                        <div class="tags">Tags: ${blog.tags && blog.tags.length > 0 ? blog.tags.map(tag => `<span>${tag}</span>`).join('') : 'None'}</div>
                        ${isMyBlogs ? `
                            <div class="actions">
                                <a href="/edit-blog/${blog._id}" class="edit-btn">Edit</a>
                                <button class="delete-btn" data-id="${blog._id}">Delete</button>
                                ${blog.state === 'draft' ? `<button class="publish-btn" data-id="${blog._id}" data-state="published">Publish</button>` : `<button class="publish-btn" data-id="${blog._id}" data-state="draft">Unpublish</button>`}
                            </div>
                        ` : ''}
                    `;
                    blogsListDiv.appendChild(blogCard);
                });

                currentPage = result.currentPage;
                totalPages = result.totalPages;
                updatePagination(targetElementId.includes('my-blogs') ? 'my-current-page-info' : 'current-page-info',
                                 targetElementId.includes('my-blogs') ? 'my-prev-page' : 'prev-page',
                                 targetElementId.includes('my-blogs') ? 'my-next-page' : 'next-page');

                // Add event listeners for delete/publish buttons if on my-blogs page
                if (isMyBlogs) {
                    blogsListDiv.querySelectorAll('.delete-btn').forEach(button => {
                        button.addEventListener('click', handleDeleteBlog);
                    });
                    blogsListDiv.querySelectorAll('.publish-btn').forEach(button => {
                        button.addEventListener('click', handleChangeBlogState);
                    });
                }

            } else {
                blogsListDiv.innerHTML = '<p>No blogs found.</p>';
                currentPage = 0;
                totalPages = 0;
                updatePagination(targetElementId.includes('my-blogs') ? 'my-current-page-info' : 'current-page-info',
                                 targetElementId.includes('my-blogs') ? 'my-prev-page' : 'prev-page',
                                 targetElementId.includes('my-blogs') ? 'my-next-page' : 'next-page');
            }
        } else {
            blogsListDiv.innerHTML = `<p class="message error">${result.message || 'Failed to fetch blogs.'}</p>`;
            currentPage = 0;
            totalPages = 0;
            updatePagination(targetElementId.includes('my-blogs') ? 'my-current-page-info' : 'current-page-info',
                                 targetElementId.includes('my-blogs') ? 'my-prev-page' : 'prev-page',
                                 targetElementId.includes('my-blogs') ? 'my-next-page' : 'next-page');
        }
    } catch (error) {
        console.error('Error fetching blogs:', error);
        const blogsListDiv = document.getElementById(targetElementId);
        blogsListDiv.innerHTML = `<p class="message error">Network error or server unavailable.</p>`;
    }
}

function updatePagination(infoId, prevBtnId, nextBtnId) {
    const info = document.getElementById(infoId);
    const prevBtn = document.getElementById(prevBtnId);
    const nextBtn = document.getElementById(nextBtnId);

    if (info) info.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// Pagination Event Listeners
document.getElementById('prev-page')?.addEventListener('click', () => {
    if (currentPage > 1) {
        fetchBlogs(currentPage - 1, currentFilters, 'blogs-list', false);
    }
});
document.getElementById('next-page')?.addEventListener('click', () => {
    if (currentPage < totalPages) {
        fetchBlogs(currentPage + 1, currentFilters, 'blogs-list', false);
    }
});

document.getElementById('my-prev-page')?.addEventListener('click', () => {
    if (currentPage > 1) {
        fetchBlogs(currentPage - 1, currentFilters, 'my-blogs-list', true);
    }
});
document.getElementById('my-next-page')?.addEventListener('click', () => {
    if (currentPage < totalPages) {
        fetchBlogs(currentPage + 1, currentFilters, 'my-blogs-list', true);
    }
});


// Filter/Sort Handlers for Public Blogs
document.getElementById('apply-filters')?.addEventListener('click', () => {
    const title = document.getElementById('search-title').value;
    const author = document.getElementById('search-author').value;
    const tags = document.getElementById('search-tags').value;
    const orderBy = document.getElementById('sort-order').value;

    currentFilters = {
        title,
        author,
        tags,
        order_by: orderBy
    };
    fetchBlogs(1, currentFilters, 'blogs-list', false);
});

// Filter Handlers for My Blogs
document.getElementById('filter-state')?.addEventListener('change', (event) => {
    const state = event.target.value;
    currentFilters = { state };
    fetchBlogs(1, currentFilters, 'my-blogs-list', true);
});


async function handleCreateBlog(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.tags = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag); // Convert tags string to array

    try {
        const response = await fetch(`${API_BASE_URL}/blogs`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (response.ok) {
            displayMessage('create-blog-message', 'Blog created successfully (in draft state)!', false);
            form.reset();
            window.location.href = '/my-blogs'; // Redirect to my blogs
        } else {
            displayMessage('create-blog-message', result.message || 'Failed to create blog', true);
        }
    } catch (error) {
        console.error('Error creating blog:', error);
        displayMessage('create-blog-message', 'Network error or server unavailable', true);
    }
}

async function fetchAndPopulateBlogForEdit(blogId) {
    try {
        const response = await fetch(`${API_BASE_URL}/blogs/my-blogs/${blogId}`, {
             headers: getAuthHeaders() // Using my-blogs route to ensure owner can see drafts
        });
        const blog = await response.json();

        if (response.ok) {
            document.getElementById('edit-title').value = blog.title;
            document.getElementById('edit-description').value = blog.description || '';
            document.getElementById('edit-tags').value = blog.tags ? blog.tags.join(', ') : '';
            document.getElementById('edit-body').value = blog.body;
            document.getElementById('edit-state').value = blog.state;
        } else {
            displayMessage('edit-blog-message', blog.message || 'Failed to load blog for editing.', true);
        }
    } catch (error) {
        console.error('Error fetching blog for edit:', error);
        displayMessage('edit-blog-message', 'Network error or server unavailable', true);
    }
}


async function handleUpdateBlog(event) {
    event.preventDefault();
    const form = event.target;
    const blogId = form.dataset.blogId;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.tags = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);

    try {
        const response = await fetch(`${API_BASE_URL}/blogs/${blogId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (response.ok) {
            displayMessage('edit-blog-message', 'Blog updated successfully!', false);
            // Optionally redirect or update UI
            // window.location.href = '/my-blogs';
        } else {
            displayMessage('edit-blog-message', result.message || 'Failed to update blog', true);
        }
    } catch (error) {
        console.error('Error updating blog:', error);
        displayMessage('edit-blog-message', 'Network error or server unavailable', true);
    }
}

async function handleDeleteBlog(event) {
    const blogId = event.target.dataset.id;
    if (!confirm('Are you sure you want to delete this blog?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/blogs/${blogId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            displayMessage('my-blogs-list', 'Blog deleted successfully!', false); // Display on my-blogs page
            fetchBlogs(currentPage, currentFilters, 'my-blogs-list', true); // Re-fetch list
        } else {
            const result = await response.json();
            displayMessage('my-blogs-list', result.message || 'Failed to delete blog', true);
        }
    } catch (error) {
        console.error('Error deleting blog:', error);
        displayMessage('my-blogs-list', 'Network error or server unavailable', true);
    }
}

async function handleChangeBlogState(event) {
    const blogId = event.target.dataset.id;
    const newState = event.target.dataset.state; // 'published' or 'draft'

    try {
        const response = await fetch(`${API_BASE_URL}/blogs/${blogId}/state`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ state: newState })
        });
        const result = await response.json();

        if (response.ok) {
            displayMessage('my-blogs-list', `Blog state updated to ${newState}!`, false);
            fetchBlogs(currentPage, currentFilters, 'my-blogs-list', true); // Re-fetch list
        } else {
            displayMessage('my-blogs-list', result.message || `Failed to change blog state to ${newState}`, true);
        }
    } catch (error) {
        console.error('Error changing blog state:', error);
        displayMessage('my-blogs-list', 'Network error or server unavailable', true);
    }
}

async function fetchAndDisplaySingleBlog(blogId) {
    try {
        const response = await fetch(`${API_BASE_URL}/blogs/${blogId}`);
        const blog = await response.json();

        if (response.ok) {
            document.getElementById('blog-title').textContent = blog.title;
            document.getElementById('blog-author').textContent = blog.author ? `${blog.author.first_name} ${blog.author.last_name}` : 'Unknown Author';
            document.getElementById('blog-timestamp').textContent = new Date(blog.createdAt).toLocaleDateString();
            document.getElementById('blog-read-count').textContent = blog.read_count;
            document.getElementById('blog-reading-time').textContent = blog.reading_time;
            document.getElementById('blog-description').textContent = blog.description || '';
            document.getElementById('blog-body').textContent = blog.body;

            const tagsContainer = document.getElementById('blog-tags');
            tagsContainer.innerHTML = 'Tags: ';
            if (blog.tags && blog.tags.length > 0) {
                blog.tags.forEach(tag => {
                    const span = document.createElement('span');
                    span.textContent = tag;
                    tagsContainer.appendChild(span);
                });
            } else {
                tagsContainer.textContent += 'None';
            }

        } else {
            displayMessage('blog-message', blog.message || 'Failed to load blog.', true);
        }
    } catch (error) {
        console.error('Error fetching single blog:', error);
        displayMessage('blog-message', 'Network error or server unavailable', true);
    }
}


// --- Event Listeners and Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    updateNav(); // Update navigation links based on login status

    // Attach event listeners to forms based on current page
    if (document.getElementById('register-form')) {
        document.getElementById('register-form').addEventListener('submit', handleRegister);
    }
    if (document.getElementById('login-form')) {
        document.getElementById('login-form').addEventListener('submit', handleLogin);
    }
    if (document.getElementById('logout-btn')) {
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
    }
    if (document.getElementById('create-blog-form')) {
        document.getElementById('create-blog-form').addEventListener('submit', handleCreateBlog);
    }
    if (document.getElementById('edit-blog-form')) {
        const blogId = document.getElementById('edit-blog-form').dataset.blogId;
        if (blogId) {
            fetchAndPopulateBlogForEdit(blogId);
            document.getElementById('edit-blog-form').addEventListener('submit', handleUpdateBlog);
        }
    }
    if (document.querySelector('.single-blog-view')) {
        const urlSegments = window.location.pathname.split('/');
        const blogId = urlSegments[urlSegments.length - 1];
        if (blogId) {
            fetchAndDisplaySingleBlog(blogId);
        }
    }


    // Load blogs if on the home page or my-blogs page
    if (window.location.pathname === '/') {
        fetchBlogs(1, {}, 'blogs-list', false);
    } else if (window.location.pathname === '/my-blogs') {
        if (isLoggedIn()) {
            fetchBlogs(1, {}, 'my-blogs-list', true);
        } else {
            const myBlogsList = document.getElementById('my-blogs-list');
            if (myBlogsList) {
                myBlogsList.innerHTML = '<p class="message error">Please log in to view your blogs.</p>';
            }
        }
    }
});

// Simple confirmation dialog replacement since `alert()` and `confirm()` are disallowed.
function confirm(message) {
    const response = prompt(message + " (Type 'yes' to confirm)");
    return response && response.toLowerCase() === 'yes';
}

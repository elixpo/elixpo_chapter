
# ELIXPO - The Portfolio

A modern web application showcasing projects, publications, and connecting with the AI community.

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. **Navigate to the project directory:**
    ```bash
    cd elixpo
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Start the development server:**
    ```bash
    npm run dev
    ```
    This command uses `concurrently` to run both the frontend and backend simultaneously.

## 📁 Project Structure

```
elixpo/
├── index.html          # Main homepage
├── about/              # About page
├── projects/           # Projects showcase
├── publications/       # Publications page
├── connect/            # Contact/Connect page
├── CSS/                # Stylesheets and assets
├── JS/                 # JavaScript modules
└── api/                # Backend API
```

## ⚙️ Configuration

### Environment Variables
- For now, **skip setting up GitHub PAT** in the `.env` file
- The projects section will work with a dummy token that will be provided separately (on need)

## 🛠️ Features

- **Homepage**: Interactive landing page with spotlight sections
- **About**: Information about the AI chapter
- **Projects**: Showcase of projects (GitHub integration)
- **Publications**: Academic publications and research
- **Connect**: Contact and networking page

## 🔧 Development

The application uses:
- Vanilla HTML/CSS/JavaScript for the frontend
- Node.js/Express for the backend API
- Concurrent development setup for seamless full-stack development

## 📦 Dependencies

All required dependencies will be installed via `npm install`. The project uses `concurrently` to manage both frontend and backend development servers.

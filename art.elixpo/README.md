# ✨ Elixpo Art Generator: Create. Connect. Inspire.

A cutting-edge, **AI-powered art generation platform** built with a modern web technology stack.  
Elixpo provides users with advanced image generation capabilities, robust gallery management, and vibrant social features to foster a creative community.

---

## 🚀 Features

| Icon | Feature | Description |
| :---: | :--- | :--- |
| 🎨 | **AI Art Generation** | Create stunning, unique artwork using advanced AI models like the Pollinations API. |
| 🔒 | **Secure Auth** | Seamless and secure sign-up, sign-in, and user profile management. |
| 🖼️ | **Gallery System** | Effortlessly browse, save, and manage all your generated masterpieces. |
| 🌐 | **Social Feed** | Share your creations and discover inspiring artwork from the global community. |
| 📚 | **Blog System** | Stay informed with educational content, tutorials, and project updates. |
| 📱 | **Responsive Design** | A beautiful and optimized experience on all devices: desktop, tablet, and mobile. |

---

## 🛠️ Tech Stack & Architecture

Elixpo is built as a comprehensive full-stack application.

### Core Technologies

- **Frontend**: HTML5, CSS3, **JavaScript (ES6+)**
- **Backend**: **Node.js**, **Express.js** (for a fast, scalable API)
- **AI Integration**: Pollinations API and other powerful AI services
- **Package Management**: npm

### Development Tools

- `browsersync`: For live-reloading and streamlined frontend development.
- `concurrently`: To manage the simultaneous start of frontend and backend services.

---

## ⚙️ Getting Started

Follow these steps to get your local development environment up and running.

### Prerequisites

Ensure you have the following installed on your system:

- **Node.js**: v24 or v25  
- **npm**: v11 or higher (comes bundled with Node.js)

### Installation Guide

1. **Navigate to the project directory:**
   ```bash
   cd art.elixpo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   > 💡 This command uses `concurrently` to launch the Node.js backend and the frontend server with hot-reloading simultaneously.

### Environment Setup Note

**You can skip the GitHub PAT (Personal Access Token) configuration** for basic local development.  
A dummy token for testing purposes will be provided separately if required.

---

## 📂 Project Structure

```
art.elixpo/
├── api/                  # Backend API services
├── blogs/                # Blog content and assets
├── CSS/                  # Stylesheets for different modules
├── integrations/         # Integration guides and pages
├── JS/                   # JavaScript for different modules
├── node_and_python/      # Python scripts for ML and data processing
├── src/                  # Main source files for different pages
├── voices/               # Audio assets
├── .env.example
├── .gitignore
├── DEPLOYMENT.md
├── Dockerfile.frontend
├── docker-compose.yml
├── index.html            # Main landing page
├── nginx.conf
├── package.json
├── README.md
└── LICENSE
```

---

## 📄 License

This project is licensed under the **Apache License 2.0**.  
See the [`LICENSE`](LICENSE) file for more details.

---

> 💫 *Elixpo — where creativity meets intelligence.*

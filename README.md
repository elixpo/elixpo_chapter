# ✨ Elixpo Art Generator: Create. Connect. Inspire.

A cutting-edge, **AI-powered art generation platform** built with a modern web technology stack. Elixpo provides users with advanced image generation capabilities, robust gallery management, and vibrant social features to foster a creative community.

---

## 🚀 Features

| Icon | Feature | Description |
| :---: | :--- | :--- |
| 🎨 | **AI Art Generation** | Create stunning, unique artwork using advanced AI models like the Pollinations API. |
| 🔒 | **Secure Auth** | Seamless and secure sign-up, sign-in, and user profile management. |
| 🖼️ | **Gallery System** | Effortlessly browse, save, and manage all your generated masterpieces. |
| 🌐 | **Social Feed** | Share your creations and discover inspiring artwork from the global community. |
| 🎤 | **Voice Integration** | Generate art hands-free with intuitive voice-controlled commands. |
| 📚 | **Blog System** | Stay informed with educational content, tutorials, and project updates. |
| 📱 | **Responsive Design** | A beautiful and optimized experience on all devices: desktop, tablet, and mobile. |

---

## 🛠️ Tech Stack & Architecture

Elixpo is built as a comprehensive full-stack application.

### Core Technologies

* **Frontend**: HTML5, CSS3, **JavaScript (ES6+)**
* **Backend**: **Node.js**, **Express.js** (for a fast, scalable API)
* **AI Integration**: Pollinations API and other powerful AI services
* **Package Management**: npm

### Development Tools

* `browsersync`: For live-reloading and streamlined frontend development.
* `concurrently`: To manage the simultaneous start of frontend and backend services.

---

## ⚙️ Getting Started

Follow these steps to get your local development environment up and running.

### Prerequisites

Ensure you have the following installed on your system:

* **Node.js**: v14 or higher
* **npm**: v6 or higher (comes bundled with Node.js)

### Installation Guide

1.  **Navigate to the project directory:**
    ```bash
    cd art.elixpo
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```
    > 💡 This command uses `concurrently` to launch the Node.js backend and the frontend server with hot-reloading simultaneously.

### Environment Setup Note

**You can skip the GitHub PAT (Personal Access Token) configuration** for basic local development. The project is designed to run without it, and a dummy token for testing purposes will be provided separately if required.

---

## 📂 Project Structure

A clean, modular structure for maintainability and scalability.

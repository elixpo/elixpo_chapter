# Chat Elixpo

![image](https://github.com/user-attachments/assets/ab767204-588d-4367-8551-7ac43d523e1b)

A comprehensive chat application with integrated news, podcast, and weather features built with Node.js and modern web technologies.

## Project Structure

```
chat.elixpo/
├── .gitignore
├── package.json
├── README.md
├── server.js                    # Main server entry point
├── elixpoChatBash.sh           # Deployment script
│
├── BackendNode/                # Backend Node.js modules
│   ├── firebaseConfig.js       # Firebase configuration
│   ├── getDominantColor.js     # Image color analysis
│   ├── locationWeather.js      # Weather data fetching
│   ├── newsDetailsFetch.js     # News API integration
│   └── podCastDetailsFetch.js  # Podcast data management
│
├── public/                     # Frontend static files
│   ├── index.html              # Main homepage
│   ├── daily.html              # Daily news page
│   ├── podcast.html            # Podcast section
│   ├── search.html             # Search functionality
│   ├── weather.html            # Weather dashboard
│   ├── 404.html                # Error page
│   │
│   ├── CSS/                    # Stylesheets
│   │   ├── dailyNewsSection.css
│   │   ├── newsSectionResponsive.css
│   │   ├── podcastSection.css
│   │   ├── podcastSectionResponsive.css
│   │   ├── search.css
│   │   ├── searchPageResponsive.css
│   │   ├── weather.css
│   │   ├── weatherMarkdown.css
│   │   ├── weatherResponsive.css
│   │   ├── welcomeSection.css
│   │   ├── welcomeSectionResponsive.css
│   │   ├── typeWriter_and_skletonLoader.css
│   │   ├── oopsie.css
│   │   └── IMAGES/
│   │       └── ElixpoChatIcon.png
│   │
│   └── JS/                     # Client-side JavaScript
│       ├── welcomeSection.js
│       ├── dailyNewsGeneral.js
│       ├── dailyPodcast.js
│       ├── search.js
│       ├── weatherGeneral.js
│       ├── linkRedirect.js
│       ├── typeWriter_and_skletonLoader.js
│       └── oopsie.js
│
└── pythonHelpers/              # Python backend services
    ├── NEWS_UPDATE/            # News processing modules
    │   ├── getNewsInfo.py
    │   ├── getNewsTopics.py
    │   ├── processNewsGeneral.py
    │   ├── processNewsModule.py
    │   ├── bannerImageForNews.py
    │   ├── thumbnailImageForNews.py
    │   └── newsVocieOver.py
    │
    └── PODCAST/                # Podcast generation modules
        ├── podCastCreator.py
        ├── podcastID.py
        ├── podCastImage.py
        ├── podCastModule.py
        ├── storyTeller.py
        └── topicScraper.py
```

## Prerequisites

Before installing and running this project, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **Python** (v3.8 or higher) for backend services
- **Firebase** account for database services

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd chat.elixpo
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory and configure your Firebase and API keys:

```env
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
# Add other required environment variables
```

### 4. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 5. Run the Application

The project uses Node.js with npm scripts for running the application:

```bash
# Start the development server
npm start

# Or run the server directly
node server.js
```

### 6. Build Configuration

This project utilizes build configurations for optimal deployment. The build process is managed through npm scripts defined in `package.json`.

```bash
# Build for production
npm run build

# Run development build
npm run dev
```

## Features

- **Real-time Chat Interface**: Interactive messaging system
- **Daily News Integration**: Automated news fetching and display
- **Podcast Generation**: AI-powered podcast creation
- **Weather Dashboard**: Location-based weather information
- **Search Functionality**: Comprehensive search across all content
- **Responsive Design**: Mobile-first responsive layouts

## Development

The application follows a modular architecture:

- **Frontend**: Vanilla JavaScript with responsive CSS
- **Backend**: Node.js with Express.js framework
- **Database**: Firebase for real-time data storage
- **Python Services**: Microservices for content generation
- **Build System**: npm-based build configuration

## Deployment

Use the provided deployment script:

```bash
./elixpoChatBash.sh
```

## License

[Add your license information here]

## Contributing

[Add contributing guidelines here]



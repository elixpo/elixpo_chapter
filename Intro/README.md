# LixBlogs Intro Page

User onboarding page for completing profile setup after registration.

## Features

- **Username Availability Check**: Uses Bloom Filter to check if username is taken
- **Real-time Validation**: Instant feedback while typing
- **Profile Picture Upload**: Upload and preview profile images
- **Bio Section**: Add bio up to 150 characters
- **Responsive Design**: Works on desktop and mobile

## Files

```
Intro/
├── index.html          # Main page
├── style.css           # Styling
├── script.js           # Main functionality
├── bloomFilter.js      # Username checking
└── README.md          # This file
```

## API Endpoints

- `POST /api/check-username` - Check username availability
- `POST /api/register-username` - Register username in bloom filter

## How to Run

1. Start backend: `npm run backend`
2. Start frontend: `npm run frontend`
3. Go to: `http://localhost:3000/Intro/`

## What's Working

✅ Bloom filter username checking  
✅ Real-time validation  
✅ Profile picture upload  
✅ Bio with character counter  
✅ Responsive design  
✅ Backend API integration

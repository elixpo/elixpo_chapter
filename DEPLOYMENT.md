# Deployment Guide for Elixpo Art Generator

This guide provides comprehensive instructions for deploying the Elixpo Art Generator in various environments, from local development to production setups using Docker and cloud platforms.

## Table of Contents
- [Local Development Deployment](#local-development-deployment)
- [Docker Deployment](#docker-deployment)
- [Cloud Platform Deployments](#cloud-platform-deployments)
- [Environment Variables](#environment-variables)
- [Security Considerations](#security-considerations)
- [Monitoring and Logging](#monitoring-and-logging)

## Local Development Deployment

### Basic Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/elixpo_chapter.git
   cd elixpo_chapter/art.elixpo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```env
   PORT=3000
   NODE_ENV=development
   API_KEY=your_pollinations_api_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Docker Deployment

### Using Docker Compose
1. Ensure Docker and Docker Compose are installed on your system

2. Use the provided `Dockerfile.frontend`:
   ```dockerfile
   # The Dockerfile is already configured in the repository
   # You can directly use docker-compose
   ```

3. Deploy using Docker Compose:
   ```bash
   docker-compose up -d
   ```

### Manual Docker Build
```bash
docker build -t elixpo-art -f Dockerfile.frontend .
docker run -p 3000:3000 elixpo-art
```

## Cloud Platform Deployments

### Vercel Deployment
1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy to Vercel:
   ```bash
   vercel
   ```

3. For production deployment:
   ```bash
   vercel --prod
   ```

### AWS Deployment
1. Build the Docker image
2. Push to Amazon ECR
3. Deploy using ECS or EKS

Example ECS deployment:
```bash
aws ecr get-login-password --region region | docker login --username AWS --password-stdin aws_account_id.dkr.ecr.region.amazonaws.com
docker push aws_account_id.dkr.ecr.region.amazonaws.com/elixpo-art:latest
```

## Environment Variables

Required environment variables:
- `PORT`: Application port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `API_KEY`: Pollinations API key
- `DATABASE_URL`: Database connection string
- `JWT_SECRET`: JWT signing secret

## Security Considerations

1. Always use HTTPS in production
2. Implement rate limiting:
   ```javascript
   app.use(rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   }));
   ```

3. Set secure headers:
   ```javascript
   app.use(helmet());
   ```

## Monitoring and Logging

### Setup Application Logging
```javascript
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Health Check Endpoint
Add a health check endpoint to your application:
```javascript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});
```

## Troubleshooting

Common issues and solutions:
1. **Port already in use**: Change the port in .env file
2. **API rate limiting**: Implement caching
3. **Memory issues**: Configure Docker container limits

## Performance Optimization

1. Enable compression:
   ```javascript
   app.use(compression());
   ```

2. Implement caching:
   ```javascript
   app.use(cache('2 minutes'));
   ```

3. Use CDN for static assets

Remember to check the main repository's documentation for additional deployment scenarios and updates to this guide.

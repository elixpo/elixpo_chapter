# Use Node.js 18 as specified in package.json
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json from the root
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Install PM2 globally
RUN npm install -g pm2

# Copy the api directory contents
COPY api/ ./

# Expose the port the app runs on
EXPOSE 3005

# Start the application with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
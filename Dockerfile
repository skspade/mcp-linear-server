FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Run the server
CMD ["node", "--experimental-specifier-resolution=node", "dist/server.js"]

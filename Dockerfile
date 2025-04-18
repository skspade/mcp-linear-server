FROM node:23-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# No need for the build step anymore when using direct TS execution
# RUN npm run build

# Run the TypeScript server directly
CMD ["node", "--import", "tsx", "src/server.ts"]

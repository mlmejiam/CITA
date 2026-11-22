# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build Angular app for production
RUN npm run build

# Stage 2: Production stage
FROM node:22-alpine

WORKDIR /app

# Install a simple HTTP server to serve static files
RUN npm install -g http-server

# Copy built app from builder stage
COPY --from=builder /app/dist/Cita/browser ./public

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

# Start the server
CMD ["http-server", "public", "-p", "3000", "-c-1"]

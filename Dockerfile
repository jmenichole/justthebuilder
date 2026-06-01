# Use Node.js 22 Alpine for a small footprint
FROM node:22-alpine

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY . .

# Start the application
CMD ["pnpm", "start"]
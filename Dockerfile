FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "start"]

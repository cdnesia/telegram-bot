FROM node:22-alpine

WORKDIR /app

# Copy package files dulu (agar layer cache dipakai kalau dependency tidak berubah)
COPY package*.json ./
RUN npm install --production

# Copy seluruh kode
COPY . .

# Jalankan bot
CMD ["node", "index.js"]

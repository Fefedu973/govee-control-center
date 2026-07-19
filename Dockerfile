FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ libudev-dev bluetooth bluez \
  && rm -rf /var/lib/apt/lists/* \
  && npm install
COPY . .
RUN npm run build
EXPOSE 8787/tcp 4001/udp 4002/udp 4003/udp
CMD ["npm", "start"]

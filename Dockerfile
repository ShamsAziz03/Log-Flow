FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm install
RUN npm run build

ENV NODE_OPTIONS="--max-old-space-size=192"
EXPOSE 8080

CMD ["node", "dist/server.js"]
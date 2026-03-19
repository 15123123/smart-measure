FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=80
ENV CLOUD_ENV=prod-2g2msnzi7f0f35d7
ENV TCB_ENV=prod-2g2msnzi7f0f35d7

EXPOSE 80

CMD ["node", "app.js"]

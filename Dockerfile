# Etapa de build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Etapa final
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app ./

RUN npm install -g concurrently

ENV PORT=3005
ENV NUXT_PORT=3000

EXPOSE 3000 3005

CMD ["npm", "run", "start"]

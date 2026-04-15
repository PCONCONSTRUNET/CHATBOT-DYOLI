FROM node:20-slim

# Instala dependências necessárias para algumas libs nativas se precisarem
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expõe a porta que o express usa
EXPOSE 3000

CMD ["npm", "start"]

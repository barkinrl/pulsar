# Base imaj (Node 20)
FROM node:20-alpine

WORKDIR /app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm install

# Kaynak kodu kopyala
COPY . .

# Vite'in dışarıdan erişilebilmesi için host parametresi
EXPOSE 5173

# Development modunda çalıştır (Dinamik ENV desteği için)
CMD ["npm", "run", "dev", "--", "--host"]
# 1️⃣ Start from official Node image
FROM node:18-slim

# 2️⃣ Install dependencies needed for MongoDB tools
RUN apt-get update && apt-get install -y wget gnupg

# 3️⃣ Add MongoDB official repository for database tools
RUN wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-6.0.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/6.0 main" \
    | tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# 4️⃣ Install MongoDB database tools (mongodump, mongorestore)
RUN apt-get update && apt-get install -y mongodb-database-tools && rm -rf /var/lib/apt/lists/*

# 5️⃣ Set working directory inside container
WORKDIR /app

# 6️⃣ Copy package files first (for better layer caching)
COPY package*.json ./

# 7️⃣ Install Node dependencies
RUN npm install --production

# 8️⃣ Copy the rest of your app
COPY . .

# 9️⃣ Expose port (Render expects your app to listen here)
EXPOSE 3000

# 🔟 Start your app
CMD ["node", "server.js"]

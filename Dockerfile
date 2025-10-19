# 1️⃣ Use a lightweight Node image
FROM node:18-slim

# 2️⃣ Install dependencies required to fetch and verify MongoDB packages
RUN apt-get update && apt-get install -y wget gnupg

# 3️⃣ Add MongoDB's official repo (for mongodump, mongorestore)
RUN wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-6.0.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/6.0 main" \
  | tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# 4️⃣ Install MongoDB database tools
RUN apt-get update && apt-get install -y mongodb-database-tools && rm -rf /var/lib/apt/lists/*

# 5️⃣ Set working directory inside the container
WORKDIR /app

# 6️⃣ Copy dependency files
COPY package*.json ./

# 7️⃣ Install only production dependencies for smaller image
RUN npm install --production

# 8️⃣ Copy rest of the code
COPY . .

# 9️⃣ Expose the port your app listens on
EXPOSE 3000

# 🔟 Default command to start your app (same as your package.json)
CMD ["npm", "start"]

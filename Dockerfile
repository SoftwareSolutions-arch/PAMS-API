# 1️⃣ Use an official Node image
FROM node:18

# 2️⃣ Install MongoDB tools (includes mongodump, mongorestore)
RUN apt-get update && apt-get install -y mongodb-database-tools

# 3️⃣ Set working directory inside the container
WORKDIR /app

# 4️⃣ Copy dependency files first (better caching)
COPY package*.json ./

# 5️⃣ Install Node dependencies
RUN npm install --production

# 6️⃣ Copy the rest of your code
COPY . .

# 7️⃣ Expose the app port (same as in Render)
EXPOSE 3000

# 8️⃣ Start your app
CMD ["node", "server.js"]

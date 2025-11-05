FROM node:18-alpine as build

WORKDIR /app

# Copie du package.json
COPY package*.json ./

# Installation des dépendances
RUN npm install lucide-react react-hot-toast

# Copie du code source
COPY . .

# Construction de l'application
RUN npm run build

# Étape de production avec Nginx
FROM nginx:stable-alpine

# Copie du build de l'application React
COPY --from=build /app/build /usr/share/nginx/html

# Copie de la configuration Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposition du port
EXPOSE 80

# Commande de démarrage
CMD ["nginx", "-g", "daemon off;"]
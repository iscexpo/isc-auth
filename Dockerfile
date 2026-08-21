# Multi stage build to allow us to improve performance
FROM node:18-alpine as base
WORKDIR /usr/src/app

# Allow Next 9's webpack 4 to build under OpenSSL 3 (Node 17+)
ENV NODE_OPTIONS=--openssl-legacy-provider

# Install basic dependancies (Next.js, React)
COPY tests/docker/app/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

FROM node:18-alpine as app
ENV NODE_OPTIONS=--openssl-legacy-provider
COPY --from=base /usr/src/app ./

# Copy last build of library into the image and install dependences for it.
# This ensures the build is valid and package.json contains everything needed
# to actually run the library.
# Note: You must run `npm run build` first to build a release of the library
RUN mkdir -p node_modules/isc-auth
# Copy all entrypoints for the library (if creating a new one, add it here)
COPY index.js providers.js adapters.js client.js jwt.js node_modules/isc-auth/
# Copy the dist dir
COPY dist node_modules/isc-auth/dist
# Copy the package.json for the library and install it's dependences
COPY package*.json node_modules/isc-auth/
RUN cd node_modules/isc-auth/ && npm ci --omit=dev --legacy-peer-deps

# Copy test pages across
COPY tests/docker/app/pages ./pages

RUN npm run build

CMD [ "npm", "start" ]
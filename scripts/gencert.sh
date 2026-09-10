openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
        -keyout server.key -out server.crt \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost"

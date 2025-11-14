docker build -t elixpo-search:latest . && \
docker tag elixpo-search:latest elixpo/elixpo-search:latest && \
docker push elixpo/elixpo-search:latest
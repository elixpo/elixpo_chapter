minikube stop && \
minikube delete && \
minikube start --driver=docker --force && \
kubectl apply -f PRODUCTION/k8s/ --validate=false && \
kubectl get pods && \
minikube service elixpo-search



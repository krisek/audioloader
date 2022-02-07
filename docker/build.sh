#!bash

rm -Rf /tmp/d-audioloader
mkdir /tmp/d-audioloader

cp Dockerfile /tmp/d-audioloader
cd ..
mkdir /tmp/d-audioloader/audioloader
git archive master | tar xf - --directory /tmp/d-audioloader/audioloader
cd /tmp/d-audioloader/audioloader

# we use uWSGI from dist-packages
sed -i 's/uWSGI//' requirements.txt

cd /tmp/d-audioloader


#podman build -t audioloader .

# Set your manifest nameO
export MANIFEST_NAME="audioloader"

# Set the required variables
export BUILD_PATH="."
export REGISTRY="docker.io"
export IMAGE_NAME="audioloader"
export IMAGE_TAG="v0.0.1"

# Create a multi-architecture manifest
buildah manifest create ${MANIFEST_NAME}

# Build your amd64 architecture container
buildah bud \
    --tag "${REGISTRY}/${USER}/${IMAGE_NAME}:${IMAGE_TAG}" \
    --manifest ${MANIFEST_NAME} \
    --arch amd64 \
    ${BUILD_PATH}

# Build your amd64 architecture container
# buildah bud \
#    --tag "${REGISTRY}/${USER}/${IMAGE_NAME}:${IMAGE_TAG}" \
#    --manifest ${MANIFEST_NAME} \
#    --all-platforms \
#    ${BUILD_PATH}

# Build your arm64 architecture container
buildah bud \
    --tag "${REGISTRY}/${USER}/${IMAGE_NAME}:${IMAGE_TAG}" \
    --manifest ${MANIFEST_NAME} \
    --arch arm64 \
    ${BUILD_PATH}

# Build your arm64 architecture container
buildah bud \
    --tag "${REGISTRY}/${USER}/${IMAGE_NAME}:${IMAGE_TAG}" \
    --manifest ${MANIFEST_NAME} \
    --platform="linux/arm/v7" \
     ${BUILD_PATH}


# Push the full manifest, with both CPU Architectures
buildah manifest push --all \
    ${MANIFEST_NAME} \
    "docker://${REGISTRY}/${USER}/${IMAGE_NAME}:${IMAGE_TAG}"

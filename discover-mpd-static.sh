#!/bin/bash


DATE=$(date +%s).000000
declare -A devices

devices=(
    ["ip_or_host_name_1"]="display_name_1"
    ["ip_or_host_name_2"]="display_name_2"
)

for key in "${!devices[@]}"; do
        redis-cli -h localhost set upnp:player:${key}_6600:data "{\"location\": \"${key}_6600\", \"ip\": \"$key\", \"name\": \"${devices[$key]}\", \"model_name\": \"$model\", \"last_seen\": $DATE}"

        redis-cli -h localhost set upnp:player:${key}_6600:last_seen $DATE
done


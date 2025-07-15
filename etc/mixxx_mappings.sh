#!/bin/bash

set -e

cd "$(dirname $0)/.."

mkdir -p public

pushd public

if [ -d "controllers" ]; then
    echo "controllers directory already exists, skipping download"
else
    git clone --depth 1 \
            --filter blob:none \
            --sparse \
            https://github.com/mixxxdj/mixxx.git
    pushd mixxx
    git sparse-checkout set res/controllers
    popd

    cp -R mixxx/res/controllers controllers
    rm -rf mixxx
fi

# Generate manifest of available controller mappings
echo "Generating controller mappings manifest..."
echo '[' > controllers/manifest.json
first=true
for file in controllers/*.midi.xml; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        xml_name=$(grep -o '<name>[^<]*</name>' "$file" | head -1 | sed 's/<name>//; s/<\/name>//')

        # If no XML name found, use filename without extension as fallback
        if [ -z "$xml_name" ]; then
            xml_name="${filename%.midi.xml}"
        fi

        # Extract controller ID from XML
        controller_id=$(grep -o '<controller id="[^"]*"' "$file" | sed 's/<controller id="//; s/"//')

        # If no controller ID found, use filename without extension as fallback
        if [ -z "$controller_id" ]; then
            controller_id="$xml_name"
        fi

        if [ "$first" = true ]; then
            first=false
        else
            echo ',' >> controllers/manifest.json
        fi
        echo -n "  {\"name\": \"$xml_name\", \"filename\": \"$filename\", \"id\": \"$controller_id\"}" >> controllers/manifest.json
    fi
done
echo '' >> controllers/manifest.json
echo ']' >> controllers/manifest.json

echo "Generated manifest with $(grep -c '"name"' controllers/manifest.json) controller mappings"

popd

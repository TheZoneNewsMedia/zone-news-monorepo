#!/bin/bash

# Archive script to clean up duplicate and test files
# Keeps only bot.js as the stable main entry point

echo "🧹 Starting Bot Directory Cleanup..."
echo "=================================="

# Navigate to bot directory
cd "$(dirname "$0")/.." || exit 1

# Create archive directory with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_DIR="archive/cleanup_${TIMESTAMP}"
mkdir -p "$ARCHIVE_DIR"

echo "📁 Created archive directory: $ARCHIVE_DIR"

# Files to archive (not delete, for safety)
FILES_TO_ARCHIVE=(
    "index.js"                    # Duplicate - just re-exports bot.js
    "test-comprehensive.js"       # Test file
    "test-improved-commands.js"   # Test file  
    "force-start.js"             # Utility file
    "index-enhanced.js"          # Old enhanced version
    "index-final.js"             # Old final version
    "index-integrated.js"        # Old integrated version
    "index-simple.js"            # Old simple version
)

# Archive each file if it exists
for file in "${FILES_TO_ARCHIVE[@]}"; do
    if [ -f "$file" ]; then
        echo "📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
    else
        echo "⏭️  Skip (not found): $file"
    fi
done

# Update package.json to point directly to bot.js
if [ -f "package.json" ]; then
    echo "� Updating package.json main entry..."
    # Use sed to update main entry
    sed -i.bak 's/"main": "index.js"/"main": "bot.js"/' package.json
    if [ -f "package.json.bak" ]; then
        rm package.json.bak
    fi
fi

# Create a manifest of what was archived
cat > "$ARCHIVE_DIR/ARCHIVE_MANIFEST.md" << EOF
# Archive Manifest
Date: $(date)
Reason: Cleaning up duplicate files to maintain single stable bot.js entry point

## Files Archived:
$(ls -la "$ARCHIVE_DIR" | grep -v ARCHIVE_MANIFEST)

## Action Taken:
- Removed index.js (was just re-exporting bot.js)
- Archived test files (test-comprehensive.js, test-improved-commands.js)
- Archived utility files (force-start.js)
- Archived old versions (index-enhanced.js, index-final.js, etc.)
- Updated package.json to use bot.js as main entry

## Result:
- bot.js is now the single stable entry point
- All test and duplicate files preserved in archive
EOF

echo ""
echo "✅ Cleanup Complete!"
echo "==================="
echo "📊 Summary:"
echo "  - Archived files to: $ARCHIVE_DIR"
echo "  - Updated package.json main entry to bot.js"
echo "  - Created archive manifest"
echo ""
echo "🎯 Result: bot.js is now the single stable entry point"

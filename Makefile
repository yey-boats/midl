# MIDL-6: build helper tools into an ignored, repo-local build dir (cpp/build/)
# rather than fixed /tmp paths, which could collide across concurrent runs/users.
CXX ?= c++
CXXFLAGS ?= -std=c++17
BUILD_DIR := cpp/build

.PHONY: gen-manifest check-catalog check-tools

# Verify a C++17 toolchain is available before attempting a compile.
check-tools:
	@command -v $(CXX) >/dev/null 2>&1 || { \
		echo "error: C++ compiler '$(CXX)' not found. Install a C++17 toolchain (e.g. g++ or clang++)." >&2; \
		exit 1; \
	}
	@echo "$(CXX): $$($(CXX) --version | head -n1)"

gen-manifest: check-tools
	@mkdir -p schemas/gen $(BUILD_DIR)
	@$(CXX) $(CXXFLAGS) -Icpp/include cpp/tools/gen.cpp -o $(BUILD_DIR)/yb_midl_gen
	$(BUILD_DIR)/yb_midl_gen square-480 esp32-4848s040 > schemas/gen/yb-midl-capabilities.square-480.json
	$(BUILD_DIR)/yb_midl_gen landscape-800x480 waveshare-touch-lcd-4_3 > schemas/gen/yb-midl-capabilities.landscape-800x480.json
	$(BUILD_DIR)/yb_midl_gen landscape-1024x600 waveshare-touch-lcd-5_1024x600 > schemas/gen/yb-midl-capabilities.landscape-1024x600.json
	$(BUILD_DIR)/yb_midl_gen round-360 waveshare-esp32-s3-round-360 > schemas/gen/yb-midl-capabilities.round-360.json
	@echo "generated schemas/gen/*.json"

check-catalog: check-tools
	@mkdir -p $(BUILD_DIR)
	@$(CXX) $(CXXFLAGS) -Icpp/include cpp/tools/check_catalog.cpp -o $(BUILD_DIR)/yb_midl_check
	$(BUILD_DIR)/yb_midl_check

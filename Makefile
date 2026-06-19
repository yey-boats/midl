.PHONY: gen-manifest check-catalog

gen-manifest:
	@mkdir -p schemas/gen
	@c++ -std=c++17 -Icpp/include cpp/tools/gen.cpp -o /tmp/yb_midl_gen
	/tmp/yb_midl_gen square-480 esp32-4848s040 > schemas/gen/yb-midl-capabilities.square-480.json
	/tmp/yb_midl_gen landscape-800x480 waveshare-touch-lcd-4_3 > schemas/gen/yb-midl-capabilities.landscape-800x480.json
	/tmp/yb_midl_gen landscape-1024x600 waveshare-touch-lcd-5_1024x600 > schemas/gen/yb-midl-capabilities.landscape-1024x600.json
	@echo "generated schemas/gen/*.json"

check-catalog:
	@c++ -std=c++17 -Icpp/include cpp/tools/check_catalog.cpp -o /tmp/yb_midl_check
	/tmp/yb_midl_check

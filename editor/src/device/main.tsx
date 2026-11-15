// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Entry of the device-hosted editor page (editor/dist/device/index.html):
// mounts DeviceApp into #app against the same-origin display API.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { DeviceApp } from "./DeviceApp";
import { DeviceApi } from "./device-api";

const el = document.getElementById("app");
if (el) createRoot(el).render(createElement(DeviceApp, { api: new DeviceApi() }));

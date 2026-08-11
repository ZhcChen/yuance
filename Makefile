.PHONY: help frontend-check web-build api-run api-test api-js-test api-full-test api-build api-fmt api-clippy api-browser-smoke api-image-smoke api-migrate-status api-migrate-up api-migrate-create api-seed-core api-seed-demo api-seed-local-admin api-files-cleanup-pending api-files-audit-objects api-image-amd64 validation-prepare validation-api validation-web validation-desktop validation-status deploy-production deploy-validate crg.build crg.update crg.status crg.review crg.guard

CRG_VERSION ?= 2.3.7
CRG := uvx --from code-review-graph==$(CRG_VERSION) code-review-graph
CRG_BASE = $(if $(strip $(BASE)),$(BASE),HEAD~1)

define require_cmd
command -v $(1) >/dev/null 2>&1 || { echo "[make] 缺少命令: $(1)"; exit 1; }
endef

help:
	@echo "元策开发命令"
	@echo "  make frontend-check"
	@echo "  make web-build"
	@echo "  make api-run"
	@echo "  make api-test"
	@echo "  make api-js-test"
	@echo "  make api-full-test"
	@echo "  make api-build"
	@echo "  make api-fmt"
	@echo "  make api-clippy"
	@echo "  make api-browser-smoke"
	@echo "  make api-image-smoke"
	@echo "  make api-seed-local-admin"
	@echo "  make api-files-cleanup-pending"
	@echo "  make api-files-audit-objects"
	@echo "  make api-image-amd64"
	@echo "  make validation-prepare"
	@echo "  make validation-api"
	@echo "  make validation-web"
	@echo "  make validation-desktop"
	@echo "  make validation-status"
	@echo "  make deploy-production"
	@echo "  make deploy-validate"
	@echo "  make crg.build"
	@echo "  make crg.update"
	@echo "  make crg.status"
	@echo "  make crg.review BASE=<git-ref>"
	@echo "  make crg.guard"

frontend-check:
	npm run check:frontend

web-build:
	npm --prefix web run build

api-run:
	cargo run -p yuance-api -- serve

api-test:
	cargo test -p yuance-api

api-js-test:
	node scripts/test-discussion-js.mjs

api-full-test: api-js-test api-test

api-build:
	cargo build -p yuance-api

api-fmt:
	cargo fmt --all

api-clippy:
	cargo clippy -p yuance-api --all-targets -- -D warnings

api-browser-smoke:
	./scripts/browser-smoke.sh

api-image-smoke:
	sh ./scripts/smoke-web-app-image.sh

api-migrate-status:
	cargo run -p yuance-api -- migrate status

api-migrate-up:
	cargo run -p yuance-api -- migrate up

api-migrate-create:
	cargo run -p yuance-api -- migrate create $(NAME)

api-seed-core:
	cargo run -p yuance-api -- seed core

api-seed-demo:
	cargo run -p yuance-api -- seed demo

api-seed-local-admin:
	cargo run -p yuance-api -- seed local-admin

api-files-cleanup-pending:
	cargo run -p yuance-api -- files cleanup-pending --older-than-hours $(or $(HOURS),24)

api-files-audit-objects:
	cargo run -p yuance-api -- files audit-objects $(if $(INCLUDE_DELETED),--include-deleted,)

api-image-amd64:
	./scripts/build-api-image-amd64.sh

validation-prepare:
	./scripts/local-validation.sh prepare

validation-api:
	./scripts/local-validation.sh api

validation-web:
	./scripts/local-validation.sh web

validation-desktop:
	./scripts/local-validation.sh desktop

validation-status:
	./scripts/local-validation.sh status

deploy-production:
	./scripts/deploy-production.sh

deploy-validate:
	./scripts/validate-deploy-templates.sh

crg.build: ## 手工完整构建 Code Review Graph 本地图数据
	@$(call require_cmd,uvx)
	@$(CRG) build --repo "$(CURDIR)"

crg.update: ## 手工增量更新 Code Review Graph 本地图数据
	@$(call require_cmd,uvx)
	@$(CRG) update --repo "$(CURDIR)"

crg.status: ## 手工查看 Code Review Graph 本地图状态
	@$(call require_cmd,uvx)
	@$(CRG) status --repo "$(CURDIR)"

crg.review: ## 手工审查当前改动影响（可传 BASE=<git-ref>，默认 HEAD~1）
	@$(call require_cmd,uvx)
	@echo "[crg] 审查基线: $(CRG_BASE)"
	@$(CRG) detect-changes --repo "$(CURDIR)" --base "$(CRG_BASE)" --brief

crg.guard: ## 守护 CRG 受控边界（独立手工目标，不进入默认链）
	@node scripts/assert-crg-guard.mjs

.PHONY: help frontend-check web-build api-run api-test api-js-test api-full-test api-build api-fmt api-clippy api-browser-smoke api-image-smoke api-migrate-status api-migrate-up api-migrate-create api-seed-core api-seed-demo api-seed-local-admin api-files-cleanup-pending api-files-audit-objects api-image-amd64 validation-prepare validation-api validation-web validation-desktop validation-status deploy-production deploy-validate crg.build crg.update crg.status crg.review crg.guard cache-status docker-cache-status clean-rust clean-generated clean-frontend-dist clean-node-cache clean clean-deep

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
	@echo "  make cache-status"
	@echo "  make docker-cache-status"
	@echo "  make clean-rust"
	@echo "  make clean-generated"
	@echo "  make clean-frontend-dist"
	@echo "  make clean-node-cache"
	@echo "  make clean"
	@echo "  make clean-deep"

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

cache-status:
	@echo "[make] 仓库构建缓存与生成物占用"
	@for path in \
		target \
		desktop/native/file-guard/target \
		frontend/node_modules \
		web/node_modules \
		desktop/node_modules \
		frontend/node_modules/.cache \
		web/node_modules/.cache \
		desktop/node_modules/.cache \
		dist \
		web/dist \
		desktop/dist \
		desktop/renderer-dist \
		frontend/packages/*/dist \
		.artifacts \
		.code-review-graph \
		.context \
		.tmp-docx-harness \
		test-results \
		.local \
		data \
		backups; do \
		if [ -e "$$path" ]; then du -sh "$$path"; else printf '%-38s %s\n' "$$path" "不存在"; fi; \
	done
	@echo "[make] 受保护数据仅查看：.local、data、backups；所有清理目标均不会删除它们"

docker-cache-status:
	@$(call require_cmd,docker)
	@tmp="$$(mktemp)"; \
	trap 'rm -f "$$tmp"' EXIT; \
	if [ -n "$${YUANCE_DOCKER_BUILDER:-}" ]; then \
		echo "[make] Docker builder: $${YUANCE_DOCKER_BUILDER}"; \
		docker buildx du --builder "$${YUANCE_DOCKER_BUILDER}" >"$$tmp"; \
	else \
		docker buildx du >"$$tmp"; \
	fi; \
	tail -4 "$$tmp"

clean-rust:
	@if [ -L target ] || [ -L desktop/native/file-guard/target ]; then \
		echo "[make] 拒绝清理 symlink target，请先确认其指向范围" >&2; \
		exit 1; \
	fi
	rm -rf -- target desktop/native/file-guard/target
	@echo "[make] clean-rust 完成：Rust 构建产物已清理"

clean-generated:
	rm -rf dist desktop/dist web/dist desktop/renderer-dist
	@echo "[make] clean-generated 完成：前端与发布生成物已清理"

clean-frontend-dist:
	@for path in frontend/packages/*/dist; do \
		if [ -e "$$path" ]; then rm -rf -- "$$path"; fi; \
	done
	@echo "[make] clean-frontend-dist 完成：共享前端 package 生成物已清理"

clean-node-cache:
	rm -rf frontend/node_modules/.cache web/node_modules/.cache desktop/node_modules/.cache
	@echo "[make] clean-node-cache 完成：前端工具缓存已清理，依赖目录保留"

clean: clean-rust clean-generated
	@echo "[make] clean 完成：Rust 构建产物与发布产物已清理"

clean-deep: clean clean-frontend-dist clean-node-cache
	rm -rf .artifacts .code-review-graph .context desktop/node_modules web/node_modules frontend/node_modules test-results .tmp-docx-harness
	@echo "[make] clean-deep 完成：依赖与验证产物已清理，需要时执行 npm ci / make crg.build 恢复"

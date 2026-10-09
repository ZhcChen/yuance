.PHONY: help spec-kit-init spec-kit-check spec-kit-verify frontend-check web-build api-run api-test api-js-test api-full-test api-build api-fmt api-clippy api-browser-smoke api-image-smoke api-migrate-status api-migrate-up api-migrate-create api-seed-core api-seed-demo api-seed-local-admin api-files-cleanup-pending api-files-audit-objects api-image-amd64 validation-prepare validation-api validation-web validation-desktop validation-status deploy-production deploy-validate deploy-safety-test cache-status docker-cache-status clean-rust clean-generated clean-frontend-dist clean-node-cache clean clean-deep

export SPEC_KIT_FEATURE = $(FEATURE)
export SPEC_KIT_STAGE = $(STAGE)

DEV_COMMANDS := help doctor setup prepare seed api web desktop status check docker-doctor docker-build docker-up docker-down docker-logs docker-status docker-smoke
DEV_TARGETS := $(addprefix dev-,$(DEV_COMMANDS))
.PHONY: $(DEV_TARGETS) dev-verify

define require_cmd
command -v $(1) >/dev/null 2>&1 || { echo "[make] 缺少命令: $(1)"; exit 1; }
endef

help:
	@echo "元策开发命令"
	@echo "  make dev-help（本地开发与本机 Docker 的统一入口）"
	@echo "  make dev-doctor / dev-setup / dev-seed"
	@echo "  make dev-api / dev-web / dev-desktop"
	@echo "  make dev-docker-doctor / dev-docker-build / dev-docker-up / dev-docker-down"
	@echo "  make dev-verify"
	@echo "  make spec-kit-init FEATURE=specs/<feature>"
	@echo "  make spec-kit-check FEATURE=specs/<feature> STAGE=<stage>"
	@echo "  make spec-kit-verify"
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
	@echo "  make deploy-safety-test"
	@echo "  make cache-status"
	@echo "  make docker-cache-status"
	@echo "  make clean-rust"
	@echo "  make clean-generated"
	@echo "  make clean-frontend-dist"
	@echo "  make clean-node-cache"
	@echo "  make clean"
	@echo "  make clean-deep"

spec-kit-init:
	@test -n "$$SPEC_KIT_FEATURE" || { echo "[make] 必须设置 FEATURE=specs/<feature>"; exit 2; }
	@node scripts/ops/spec-kit.cjs init --feature "$$SPEC_KIT_FEATURE"

spec-kit-check:
	@test -n "$$SPEC_KIT_FEATURE" || { echo "[make] 必须设置 FEATURE=specs/<feature>"; exit 2; }
	@test -n "$$SPEC_KIT_STAGE" || { echo "[make] 必须设置 STAGE=clarify|plan|tasks|analyze|implement|converge"; exit 2; }
	@node scripts/ops/spec-kit.cjs check --feature "$$SPEC_KIT_FEATURE" --stage "$$SPEC_KIT_STAGE"

spec-kit-verify:
	@node --test scripts/test/spec-kit.test.cjs

$(DEV_TARGETS): dev-%:
	node scripts/ops/local-dev.cjs $*

dev-verify:
	node --test scripts/test/local-development.test.cjs

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
	node scripts/ops/local-dev.cjs docker-smoke

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
	YUANCE_LOCAL_DOCKER=1 YUANCE_API_PLATFORM=linux/amd64 YUANCE_API_IMAGE=yuance-api:local-amd64 YUANCE_API_IMAGE_TAR=.local/images/yuance-api-linux-amd64.tar ./scripts/build-api-image-amd64.sh

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

deploy-safety-test:
	node --test scripts/test/production-release-safety.test.cjs

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
	@tmp="$$(mktemp)"; \
	trap 'rm -f "$$tmp"' EXIT; \
	node scripts/ops/local-docker.cjs buildx du >"$$tmp" || exit $$?; \
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
	rm -rf .artifacts .context desktop/node_modules web/node_modules frontend/node_modules test-results .tmp-docx-harness
	@echo "[make] clean-deep 完成：依赖与验证产物已清理，需要时执行 npm ci 恢复"

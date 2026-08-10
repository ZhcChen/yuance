.PHONY: help frontend-check web-build api-run api-test api-js-test api-full-test api-build api-fmt api-clippy api-browser-smoke api-image-smoke api-migrate-status api-migrate-up api-migrate-create api-seed-core api-seed-demo api-seed-local-admin api-files-cleanup-pending api-files-audit-objects api-image-amd64 validation-prepare validation-api validation-web validation-desktop validation-status deploy-production deploy-validate

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

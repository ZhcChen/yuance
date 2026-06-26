.PHONY: help api-run api-test api-build api-fmt api-clippy api-migrate-status api-migrate-up api-migrate-create api-seed-core api-seed-demo api-seed-local-admin

help:
	@echo "元策开发命令"
	@echo "  make api-run"
	@echo "  make api-test"
	@echo "  make api-build"
	@echo "  make api-fmt"
	@echo "  make api-clippy"
	@echo "  make api-seed-local-admin"

api-run:
	cargo run -p yuance-api -- serve

api-test:
	cargo test -p yuance-api

api-build:
	cargo build -p yuance-api

api-fmt:
	cargo fmt --all

api-clippy:
	cargo clippy -p yuance-api --all-targets -- -D warnings

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


.PHONY: dev lint test install deploy-api

dev:
	cd app && npm run dev
	# server target added later

lint:
	cd app && npm run lint

test:
	cd app && npm test
	cd api && npm test

install:
	cd app && npm install
	cd api && npm install

deploy-api:
	@echo "sam deploy + seed — wired in a later change"

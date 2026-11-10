.PHONY: help install install-frontend install-backend run-backend run-frontend test lint reset-db migrate docker-up docker-down

help:
	@echo "Saakshi Project Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  install              Install all dependencies (backend + frontend)"
	@echo "  install-backend      Install backend Python dependencies"
	@echo "  install-frontend     Install frontend npm dependencies"
	@echo "  run-backend          Run the FastAPI backend server"
	@echo "  run-frontend         Run the Vite development server"
	@echo "  test                 Run all tests"
	@echo "  lint                 Run linters (ruff, black, prettier)"
	@echo "  reset-db             Drop and recreate the database"
	@echo "  migrate              Run database migrations"
	@echo "  docker-up            Start the project with Docker Compose"
	@echo "  docker-down          Stop Docker Compose services"

install: install-backend install-frontend
	@echo "All dependencies installed successfully."

install-backend:
	@echo "Installing backend dependencies..."
	cd backend/app && python -m pip install --user -r requirements.txt
	cd backend/voice && python -m pip install --user -r requirements.txt

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

run-backend:
	@echo "Starting FastAPI backend on http://localhost:8000"
	cd backend/app && uvicorn main:app --reload --port 8000

run-frontend:
	@echo "Starting Vite frontend on http://localhost:5173"
	cd frontend && npm run dev

test:
	@echo "Running tests..."
	cd backend && pytest -v

lint:
	@echo "Running linters..."
	@echo "Running ruff..."
	ruff check .
	@echo "Running black..."
	black --check .
	@echo "Running prettier..."
	npx prettier --check "frontend/**/*.{ts,tsx,css,json}"

reset-db:
	@echo "Resetting database..."
	@rm -f saakshi.db
	cd backend/app && alembic upgrade head

migrate:
	@echo "Running database migrations..."
	cd backend/app && alembic upgrade head

docker-up:
	@echo "Starting Docker Compose services..."
	docker-compose up -d

docker-down:
	@echo "Stopping Docker Compose services..."
	docker-compose down

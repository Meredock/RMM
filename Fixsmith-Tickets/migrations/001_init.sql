CREATE TABLE IF NOT EXISTS customers (
  id CHAR(36) PRIMARY KEY,
  organization_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL UNIQUE,
  unit_cost DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  location VARCHAR(255) NOT NULL,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  correspondence_email VARCHAR(255) NOT NULL,
  device_type VARCHAR(100) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  due_date DATE NOT NULL,
  serial_number VARCHAR(255),
  issue TEXT NOT NULL,
  notes TEXT,
  work_completed_summary TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS labour_logs (
  id CHAR(36) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  minutes INT NOT NULL,
  note TEXT,
  logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parts_used (
  id CHAR(36) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  inventory_item_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory(id)
);

CREATE INDEX idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_due_date ON tickets(due_date);
CREATE INDEX idx_labour_logs_ticket_id ON labour_logs(ticket_id);
CREATE INDEX idx_parts_used_ticket_id ON parts_used(ticket_id);

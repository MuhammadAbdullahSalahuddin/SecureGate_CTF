INSERT INTO users (id, email, password_hash) VALUES
	('c08f30e8-26f3-44c9-aa4a-484c11e9d0c7', 'admin@securegate.local', '$2b$12$xLuf10.GQDhabdZnNoeLrueNLYbMwOv/FSgqC16Qc1kIdG2oRkyJG'),
	('operator@securegate.local', '$2b$12$q2Ta26aeosnD1.qUtYOAFeHtT6IkZ4fKUn5glnnNcjm/s.FPrP6wy'),
	('auditor@securegate.local', '$2b$12$nuUg7XcXFaxXzDPTZeSZfuNG1PBnpea6f.0lStv6GLZCRqNN39Py2');
INSERT INTO user_roles (user_id, role_id)
	SELECT u.id, r.id FROM users u, roles r
	WHERE u.email = 'admin@securegate.local' AND r.name = 'ADMIN';

INSERT INTO user_roles (user_id, role_id)
	SELECT u.id, r.id FROM users u, roles r
	WHERE u.email = 'operator@securegate.local' AND r.name = 'OPERATOR';

INSERT INTO user_roles (user_id, role_id)
	SELECT u.id, r.id FROM users u, roles r
	WHERE u.email = 'auditor@securegate.local' AND r.name = 'AUDITOR';


INSERT INTO target_assets (id, name, hostname, port, db_type) VALUES 
	('00000000-0000-0000-0000-000000000001',
	'Corp MYSQL Server', '10.0.1.21', 22, 'mysql');

INSERT INTO access_policies (role_id, asset_id, max_session_seconds)
	SELECT r.id, '00000000-0000-0000-0000-000000000001', 3600
	FROM roles r WHERE r.name = 'ADMIN';

INSERT INTO access_policies (role_id, asset_id, max_session_seconds)
	SELECT r.id, '00000000-0000-0000-0000-000000000001', 1800
	FROM roles r WHERE r.name = 'OPERATOR';

CREATE TABLE orders
(
    order_id serial NOT NULL PRIMARY KEY,
    user_id integer,
    product_id integer,
    quantity integer,
    shipping_address varchar(200),
    status varchar(20)
);

CREATE TABLE inventory
(
    product_id serial NOT NULL PRIMARY KEY,
    total_stock integer,
    locked_stock integer
);

INSERT INTO inventory (total_stock, locked_stock)
SELECT 5, 0
FROM generate_series(1, 5);

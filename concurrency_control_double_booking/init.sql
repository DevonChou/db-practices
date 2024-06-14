CREATE TABLE seats
(
    seat_id serial NOT NULL PRIMARY KEY,
    is_booked boolean,
    name text
);

INSERT INTO seats (is_booked)
SELECT FALSE
FROM generate_series(1, 15);

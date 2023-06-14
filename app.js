const express = require('express');
const { Pool } = require('pg');


// Задача 1. Запрос данных
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'test',
  password: 'admin',
  port: 5432, // Порт по умолчанию для PostgreSQL
});

const app = express();

// Маршрут для получения данных о занятиях
app.get('/', async (req, res) => {
  try {
    const { date, status, teacherIds, studentsCount, page, lessonsPerPage } = req.query;

    // Формирование условий для фильтрации данных
    let conditions = [];
    let values = [];

    if (date) {
      const dates = date.split(',');
      if (dates.length === 1) {
        conditions.push('date = $' + (values.length + 1));
        values.push(dates[0]);
      } else if (dates.length === 2) {
        conditions.push('date BETWEEN $' + (values.length + 1) + ' AND $' + (values.length + 2));
        values.push(dates[0]);
        values.push(dates[1]);
      }
    }

    if (status) {
      conditions.push('status = $' + (values.length + 1));
      values.push(parseInt(status));
    }

    if (teacherIds) {
      const ids = teacherIds.split(',').map(id => parseInt(id));
      conditions.push('teacher_id IN (' + ids.map((id, index) => '$' + (values.length + index + 1)).join(', ') + ')');
      values.push(...ids);
    }

    if (studentsCount) {
      const counts = studentsCount.split(',');
      if (counts.length === 1) {
        conditions.push('visit_count = $' + (values.length + 1));
        values.push(parseInt(counts[0]));
      } else if (counts.length === 2) {
        conditions.push('visit_count BETWEEN $' + (values.length + 1) + ' AND $' + (values.length + 2));
        values.push(parseInt(counts[0]));
        values.push(parseInt(counts[1]));
      }
    }

    // Проверка и преобразование параметров пагинации
    const pageNumber = parseInt(page) || 1;
    const perPage = parseInt(lessonsPerPage) || 5;
    const offset = (pageNumber - 1) * perPage;

    // Формирование SQL-запроса с учетом параметров фильтра и пагинации
    let query = 'SELECT lessons.id, lessons.date, lessons.title, lessons.status, COUNT(visits.id) AS visit_count ';
    query += 'FROM lessons LEFT JOIN visits ON lessons.id = visits.lesson_id ';
    if (conditions.length > 0) {
      query += 'WHERE ' + conditions.join(' AND ') + ' ';
    }
    query += 'GROUP BY lessons.id ';
    query += 'ORDER BY lessons.date ';
    query += 'LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(perPage);
    values.push(offset);

    // Выполнение SQL-запроса к базе данных
    const { rows } = await pool.query(query, values);

    // Преобразование полученных данных в массив объектов-занятий с требуемой структурой
    const lessons = rows.map(row => ({
      id: row.id,
      date: row.date,
      title: row.title,
      status: row.status,
      visitCount: parseInt(row.visit_count),
      students: [],
      teachers: []
    }));

    // Возврат массива объектов-занятий в формате JSON
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Задача 2. Создание занятий
app.post('/lessons', (req, res) => {
  try {
    const { teacherIds, title, days, firstDate, lessonsCount, lastDate } = req.body;

    // Проверка входных данных
    if (!teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
      throw new Error('Invalid teacherIds');
    }
    if (!title || typeof title !== 'string') {
      throw new Error('Invalid title');
    }
    if (!days || !Array.isArray(days) || days.length === 0) {
      throw new Error('Invalid days');
    }
    if (!firstDate || !isValidDate(firstDate)) {
      throw new Error('Invalid firstDate');
    }
    if (lessonsCount && lastDate) {
      throw new Error('lessonsCount and lastDate are mutually exclusive');
    }
    if (lessonsCount && (lessonsCount < 1 || lessonsCount > 300)) {
      throw new Error('lessonsCount should be between 1 and 300');
    }
    if (lastDate && (!isValidDate(lastDate) || !isWithinOneYear(firstDate, lastDate))) {
      throw new Error('Invalid lastDate');
    }

    // Создание занятий
    const createdLessons = [];

    let currentDate = new Date(firstDate);
    let createdCount = 0;

    while ((!lessonsCount || createdCount < lessonsCount) && (!lastDate || currentDate <= new Date(lastDate))) {
      if (days.includes(currentDate.getDay())) {
        // Создание занятия
        const lesson = {
          teacherIds,
          title,
          date: currentDate.toISOString().split('T')[0],
        };

        createdLessons.push(lesson);
        createdCount++;
      }

      // Переход к следующей дате
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Возвращение созданных занятий
    res.json(createdLessons);
  } catch (error) {
    console.error('Error creating lessons:', error);
    res.status(400).json({ error: error.message });
  }
});

// Проверка, является ли строка допустимой датой в формате YYYY-MM-DD
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// Проверка, находится ли дата в пределах 1 года относительно первой даты
function isWithinOneYear(firstDate, date) {
  const oneYear = 365 * 24 * 60 * 60 * 1000; // 1 год в миллисекундах
  const diff = new Date(date) - new Date(firstDate);
  return diff <= oneYear;
}

// Запускаем сервер
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

module.exports = app;

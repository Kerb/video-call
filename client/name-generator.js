/**
 * Name Generator Module
 * Generates random two-word names (adjective + noun)
 */
export class NameGenerator {
  static adjectives = [
    'весёлый', 'смешной', 'быстрый', 'медленный', 'яркий',
    'тёмный', 'светлый', 'красный', 'синий', 'зелёный',
    'жёлтый', 'чёрный', 'белый', 'серый', 'полосатый',
    'пушистый', 'гладкий', 'мягкий', 'твёрдый', 'острый',
    'круглый', 'квадратный', 'длинный', 'короткий', 'высокий',
    'низкий', 'широкий', 'узкий', 'большой', 'маленький',
    'громкий', 'тихий', 'горячий', 'холодный', 'тёплый',
    'свежий', 'старый', 'новый', 'молодой', 'умный',
    'храбрый', 'спокойный', 'активный', 'ленивый', 'добрый',
    'злой', 'весёлый', 'грустный', 'радостный', 'тихий'
  ];

  static nouns = [
    'слон', 'тигр', 'лев', 'медведь', 'волк',
    'лиса', 'заяц', 'кот', 'пёс', 'попугай',
    'орёл', 'сова', 'утка', 'гусь', 'петух',
    'конь', 'корова', 'свинья', 'овца', 'коза',
    'олень', 'лось', 'кабан', 'рысь', 'пантера',
    'гепард', 'ягуар', 'леопард', 'жираф', 'зебра',
    'носорог', 'бегемот', 'слон', 'кенгуру', 'панда',
    'коала', 'обезьяна', 'горилла', 'шимпанзе', 'лемур',
    'ёж', 'белка', 'хомяк', 'мышь', 'крыса',
    'кролик', 'барсук', 'выдра', 'бобр', 'сурок'
  ];

  /**
   * Генерация случайного имени
   * @returns {string} Имя в формате "прилагательное существительное"
   */
  static generate() {
    const adjIndex = Math.floor(Math.random() * this.adjectives.length);
    const nounIndex = Math.floor(Math.random() * this.nouns.length);
    
    return `${this.adjectives[adjIndex]} ${this.nouns[nounIndex]}`;
  }

  /**
   * Проверка уникальности имени
   * @param {string} name - Имя для проверки
   * @param {Array} existingNames - Существующие имена
   * @returns {boolean} Уникально ли имя
   */
  static isUnique(name, existingNames) {
    return !existingNames.includes(name);
  }

  /**
   * Генерация уникального имени
   * @param {Array} existingNames - Существующие имена
   * @returns {string} Уникальное имя
   */
  static generateUnique(existingNames = []) {
    let attempts = 0;
    let name;
    
    do {
      name = this.generate();
      attempts++;
    } while (!this.isUnique(name, existingNames) && attempts < 10);
    
    return name;
  }
}

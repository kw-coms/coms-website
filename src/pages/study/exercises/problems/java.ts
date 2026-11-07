import type { Exercise } from '../types'

// 함수형 문제의 학생 코드는 public Main 앞에 놓이는 패키지 전용 최상위 클래스다.
const java: Exercise[] = [
  {
    id: 'java-start-name', title: '첫 인사 출력', level: 1,
    topics: ['입출력'], langs: ['java'], chapter: { java: 'start' },
    statement: '새 동아리원에게 콘솔로 인사합니다. 이름을 읽고 인사말을 출력하세요. `Main`의 `main` 메서드가 프로그램의 시작점입니다.\n\n**조건:** 이름은 공백 없는 영문 1~20자입니다.',
    inputSpec: '한 줄에 이름 하나가 주어집니다.', outputSpec: '`Hello, 이름!`을 한 줄에 출력합니다.',
    examples: [{ stdin: 'Mina\n', expected: 'Hello, Mina!\n', explain: '입력한 Mina를 인사말 가운데에 넣습니다.' }, { stdin: 'Jin\n', expected: 'Hello, Jin!\n', explain: '이름만 Jin으로 바꾸고 나머지 문구는 유지합니다.' }],
    tests: [{ stdin: 'A\n', expected: 'Hello, A!\n' }, { stdin: 'Coms\n', expected: 'Hello, Coms!\n' }, { stdin: 'Java\n', expected: 'Hello, Java!\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 이름을 읽고 인사말을 출력하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    String name = sc.next();
    System.out.println("Hello, " + name + "!");
  }
}` },
    explain: '`main`에서 이름을 읽고 문자열을 이어 붙여 출력합니다.', hints: ['`Scanner`의 `next()`로 이름을 읽으세요.', '`System.out.println`에 인사말을 전달하세요.'],
  },
  {
    id: 'java-start-number', title: '번호표 알리기', level: 1,
    topics: ['입출력'], langs: ['java'], chapter: { java: 'start' },
    statement: '행사 접수대에서 받은 번호표를 다시 확인합니다. 정수 번호를 읽어 안내 문구와 함께 출력하세요.\n\n**조건:** 번호는 1~1000입니다.',
    inputSpec: '한 줄에 번호표 정수 한 개가 주어집니다.', outputSpec: '`번호: n` 형식으로 한 줄에 출력합니다.',
    examples: [{ stdin: '7\n', expected: '번호: 7\n', explain: '읽은 번호 7 앞에 `번호: `를 붙입니다.' }, { stdin: '42\n', expected: '번호: 42\n', explain: '번호가 42이므로 안내 문구 뒤에도 42를 적습니다.' }],
    tests: [{ stdin: '1\n', expected: '번호: 1\n' }, { stdin: '1000\n', expected: '번호: 1000\n' }, { stdin: '203\n', expected: '번호: 203\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 번호를 읽고 출력하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int number = sc.nextInt();
    System.out.println("번호: " + number);
  }
}` },
    explain: '`nextInt()`로 정수를 읽은 뒤 문자열과 이어 붙입니다.', hints: ['번호는 `int` 변수에 저장하세요.', '문자열과 숫자를 `+`로 이어 붙일 수 있습니다.'],
  },
  {
    id: 'java-anatomy-two-lines', title: '프로그램의 두 출력문', level: 1,
    topics: ['입출력'], langs: ['java'], chapter: { java: 'anatomy' },
    statement: '행사 안내 프로그램의 실행 순서를 확인합니다. `Main` 클래스의 `main` 메서드에서 입력한 활동을 두 줄로 안내하세요. 각 `println` 문은 한 줄을 차지합니다.\n\n**조건:** 활동 이름은 공백 없는 영문 1~20자입니다.',
    inputSpec: '한 줄에 활동 이름 한 개가 주어집니다.', outputSpec: '첫 줄에 `START`, 둘째 줄에 활동 이름을 출력합니다.',
    examples: [{ stdin: 'Coding\n', expected: 'START\nCoding\n', explain: '첫 출력문이 START를 적고 다음 출력문이 입력한 Coding을 적습니다.' }, { stdin: 'Robot\n', expected: 'START\nRobot\n', explain: '두 번째 줄만 입력한 Robot으로 달라집니다.' }],
    tests: [{ stdin: 'A\n', expected: 'START\nA\n' }, { stdin: 'Java\n', expected: 'START\nJava\n' }, { stdin: 'Coms\n', expected: 'START\nComs\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 두 줄을 차례대로 출력하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    String activity = sc.next();
    System.out.println("START");
    System.out.println(activity);
  }
}` },
    explain: '자바는 `main` 안의 문장을 위에서 아래로 실행합니다.', hints: ['입력할 활동 이름을 먼저 읽으세요.', '`println`을 두 번 호출하세요.'],
  },
  {
    id: 'java-anatomy-print-parts', title: '두 문장으로 한 줄 출력', level: 2,
    topics: ['입출력'], langs: ['java'], chapter: { java: 'anatomy' },
    statement: '프로그램의 출력문은 위에서 아래로 실행됩니다. `Main`의 `main`에서 `print`로 안내 문구를 적고, 바로 뒤에 `println`으로 번호를 적으세요. 두 출력이 한 줄로 이어져야 합니다.\n\n**조건:** 번호는 1~1000입니다.',
    inputSpec: '한 줄에 정수 번호 한 개가 주어집니다.', outputSpec: '`참가자 n`을 한 줄에 출력합니다.',
    examples: [{ stdin: '3\n', expected: '참가자 3\n', explain: '`print`는 줄을 바꾸지 않으므로 뒤의 3이 같은 줄에 이어집니다.' }, { stdin: '19\n', expected: '참가자 19\n', explain: '안내 문구 뒤에 번호 19를 적고 `println`이 줄을 끝냅니다.' }],
    tests: [{ stdin: '1\n', expected: '참가자 1\n' }, { stdin: '1000\n', expected: '참가자 1000\n' }, { stdin: '500\n', expected: '참가자 500\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // print와 println을 차례로 사용하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.print("참가자 ");
    System.out.println(sc.nextInt());
  }
}` },
    explain: '`print`는 줄바꿈 없이 문구를 쓰고 `println`은 번호 뒤에서 줄을 바꿉니다.', hints: ['번호는 `nextInt()`로 읽으세요.', '첫 문구는 `print`, 번호는 `println`으로 출력하세요.'],
  },
  {
    id: 'java-vars-score', title: '변수에 담은 새 점수', level: 1,
    topics: ['수학'], langs: ['java'], chapter: { java: 'vars' },
    statement: '퀴즈 점수에 보너스를 더합니다. 두 값을 `int` 변수에 담고 합계를 구하세요.\n\n**조건:** 점수와 보너스는 각각 0~100입니다.',
    inputSpec: '한 줄에 점수와 보너스가 공백으로 주어집니다.', outputSpec: '새 점수를 정수 한 개로 출력합니다.',
    examples: [{ stdin: '70 5\n', expected: '75\n', explain: '70점에 보너스 5점을 더해 75점입니다.' }, { stdin: '0 10\n', expected: '10\n', explain: '기존 점수가 0이므로 보너스 10점만 남습니다.' }],
    tests: [{ stdin: '100 100\n', expected: '200\n' }, { stdin: '1 0\n', expected: '1\n' }, { stdin: '42 8\n', expected: '50\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 두 값을 변수에 저장하고 계산하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int score = sc.nextInt();
    int bonus = sc.nextInt();
    int total = score + bonus;
    System.out.println(total);
  }
}` },
    explain: '입력값과 계산 결과를 각각 `int` 변수에 저장합니다.', hints: ['`nextInt()`를 두 번 호출하세요.', '두 변수를 더한 결과를 출력하세요.'],
  },
  {
    id: 'java-vars-ticket', title: '입장권 비용 계산', level: 2,
    topics: ['수학'], langs: ['java'], chapter: { java: 'vars' },
    statement: '동아리 행사에서 일반권과 학생권을 판매합니다. 종류별 장수와 가격을 변수에 담아 총액을 구하세요.\n\n**조건:** 각 장수는 0~100장, 각 가격은 0~10000원입니다.',
    inputSpec: '한 줄에 일반권 장수, 학생권 장수, 일반권 가격, 학생권 가격이 순서대로 주어집니다.', outputSpec: '판매 총액을 정수 한 개로 출력합니다.',
    examples: [{ stdin: '2 3 5000 2000\n', expected: '16000\n', explain: '일반권 10000원과 학생권 6000원을 더합니다.' }, { stdin: '0 4 9000 1000\n', expected: '4000\n', explain: '일반권을 팔지 않아 학생권 4장의 값만 합칩니다.' }],
    tests: [{ stdin: '0 0 1 1\n', expected: '0\n' }, { stdin: '100 100 10000 10000\n', expected: '2000000\n' }, { stdin: '1 2 7 3\n', expected: '13\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 네 정수를 읽어 판매 총액을 계산하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int regularCount = sc.nextInt(), studentCount = sc.nextInt();
    int regularPrice = sc.nextInt(), studentPrice = sc.nextInt();
    System.out.println(regularCount * regularPrice + studentCount * studentPrice);
  }
}` },
    explain: '종류별 장수에 가격을 곱한 뒤 두 금액을 합합니다.', hints: ['각 종류의 금액을 따로 구하세요.', '마지막에 두 금액을 더하세요.'],
  },
  {
    id: 'java-unique-list', title: 'ArrayList로 출석 번호 정리', level: 2,
    topics: ['배열', '클래스'], langs: ['java'], chapter: { java: 'array' },
    statement: '동아리 출석 번호가 입력 순서대로 들어옵니다. 같은 번호가 다시 나오면 첫 번째 것만 남기세요. `ArrayList`를 사용해 결과를 보관하세요. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `UniqueList`입니다.',
    inputSpec: '첫 줄에 번호 수 `n`(1~30), 둘째 줄에 정수 `n`개(-100~100)가 공백으로 주어집니다.',
    outputSpec: '처음 등장한 순서대로 번호를 한 칸씩 띄어 출력합니다.',
    examples: [{ stdin: '6\n3 2 3 1 2 4\n', expected: '3 2 1 4\n', explain: '3과 2의 두 번째 등장은 버립니다.' }, { stdin: '4\n5 5 2 5\n', expected: '5 2\n', explain: '중복된 5를 한 번만 남기고 2를 뒤에 놓습니다.' }],
    tests: [{ stdin: '1\n7\n', expected: '7\n' }, { stdin: '4\n0 0 0 0\n', expected: '0\n' }, { stdin: '5\n-2 1 -2 0 1\n', expected: '-2 1 0\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt(); int[] a = new int[n];
    for (int i = 0; i < n; i++) a[i] = sc.nextInt();
    System.out.println(UniqueList.distinct(a));
  }
}` },
    starter: { java: `class UniqueList {
  static String distinct(int[] numbers) {
    return "";
  }
}` },
    solution: { java: `class UniqueList {
  static String distinct(int[] numbers) {
    ArrayList<Integer> seen = new ArrayList<>();
    for (int number : numbers) {
      if (!seen.contains(number)) seen.add(number);
    }
    StringJoiner result = new StringJoiner(" ");
    for (int number : seen) result.add(String.valueOf(number));
    return result.toString();
  }
}` },
    explain: '목록에 없는 번호만 추가하면 첫 등장 순서가 보존됩니다.', hints: ['`ArrayList<Integer>`를 만드세요.', '`contains`가 거짓일 때만 `add`하세요.'],
  },
  {
    id: 'java-bank-account', title: '잔액을 지키는 계좌', level: 2,
    topics: ['클래스'], langs: ['java'], chapter: { java: 'class' },
    statement: '작은 은행 계좌를 설계합니다. 생성자로 초기 잔액을 받고 `deposit`은 입금, `withdraw`는 출금을 처리하세요. 출금액이 잔액보다 크면 잔액을 바꾸지 않습니다. 모든 금액은 0 이상입니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `Account`입니다.',
    inputSpec: '초기 잔액, 입금액, 출금액이 공백으로 주어집니다. 각 값은 0~100000입니다.',
    outputSpec: '두 작업 후 잔액을 정수 한 개로 출력합니다.',
    examples: [{ stdin: '100 50 30\n', expected: '120\n', explain: '100+50-30입니다.' }, { stdin: '20 0 30\n', expected: '20\n', explain: '잔액보다 출금액이 커서 20을 그대로 둡니다.' }],
    tests: [{ stdin: '10 0 20\n', expected: '10\n' }, { stdin: '0 5 5\n', expected: '0\n' }, { stdin: '25 10 35\n', expected: '0\n' }, { stdin: '40 0 0\n', expected: '40\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    Account account = new Account(sc.nextInt());
    account.deposit(sc.nextInt()); account.withdraw(sc.nextInt());
    System.out.println(account.getBalance());
  }
}` },
    starter: { java: `class Account {
  private int balance;
  Account(int initial) { balance = initial; }
  void deposit(int amount) { }
  void withdraw(int amount) { }
  int getBalance() { return balance; }
}` },
    solution: { java: `class Account {
  private int balance;
  Account(int initial) { balance = initial; }
  void deposit(int amount) { balance += amount; }
  void withdraw(int amount) {
    // 잔액이 부족하면 아무것도 변경하지 않는다.
    if (amount <= balance) balance -= amount;
  }
  int getBalance() { return balance; }
}` },
    explain: '잔액은 필드로 감추고, 메서드가 유효한 변화만 허용합니다.', hints: ['`deposit`에서는 필드에 더합니다.', '출금 전 `amount <= balance`를 확인하세요.'],
  },
  {
    id: 'java-rectangle-class', title: '직사각형의 넓이와 둘레', level: 2,
    topics: ['클래스', '수학'], langs: ['java'], chapter: { java: 'class' },
    statement: '직사각형 객체 하나가 가로와 세로를 기억하게 만드세요. `area()`와 `perimeter()`가 각각 넓이와 둘레를 돌려줍니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `Rectangle`입니다.',
    inputSpec: '양의 정수 가로, 세로가 주어집니다. 각각 1~1000입니다.', outputSpec: '넓이와 둘레를 공백으로 구분해 출력합니다.',
    examples: [{ stdin: '3 4\n', expected: '12 14\n', explain: '넓이는 3×4, 둘레는 2×(3+4)입니다.' }, { stdin: '2 5\n', expected: '10 14\n', explain: '넓이는 2×5이고 둘레는 2×(2+5)입니다.' }],
    tests: [{ stdin: '1 1\n', expected: '1 4\n' }, { stdin: '5 2\n', expected: '10 14\n' }, { stdin: '1000 1000\n', expected: '1000000 4000\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    Rectangle r = new Rectangle(sc.nextInt(), sc.nextInt());
    System.out.println(r.area() + " " + r.perimeter());
  }
}` },
    starter: { java: `class Rectangle {
  private int width, height;
  Rectangle(int width, int height) { this.width = width; this.height = height; }
  int area() { return 0; }
  int perimeter() { return 0; }
}` },
    solution: { java: `class Rectangle {
  private int width, height;
  Rectangle(int width, int height) { this.width = width; this.height = height; }
  int area() { return width * height; }
  int perimeter() { return 2 * (width + height); }
}` },
    explain: '생성자는 치수를 필드에 저장하고 두 메서드는 그 필드를 읽어 계산합니다.', hints: ['필드 `width`, `height`를 사용하세요.', '둘레는 가로와 세로의 합을 두 배 합니다.'],
  },
  {
    id: 'java-student-tostring', title: '학생 카드의 문자열 표현', level: 2,
    topics: ['클래스', '문자열'], langs: ['java'], chapter: { java: 'class' },
    statement: '학생 카드를 출력하면 이름과 점수가 한눈에 보이게 하세요. `toString()`을 재정의해 `이름:점수점` 형식으로 반환합니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `StudentCard`입니다.',
    inputSpec: '공백 없는 이름(1~20자)과 점수(0~100)가 주어집니다.', outputSpec: '`이름:점수점`을 한 줄로 출력합니다.',
    examples: [{ stdin: '민지 95\n', expected: '민지:95점\n', explain: '객체를 출력하면 `toString()`이 자동 호출됩니다.' }, { stdin: '수현 0\n', expected: '수현:0점\n', explain: '이름과 0점도 같은 형식으로 이어 붙입니다.' }],
    tests: [{ stdin: 'A 0\n', expected: 'A:0점\n' }, { stdin: '준호 100\n', expected: '준호:100점\n' }, { stdin: 'Kim 7\n', expected: 'Kim:7점\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.println(new StudentCard(sc.next(), sc.nextInt()));
  }
}` },
    starter: { java: `class StudentCard {
  private String name; private int score;
  StudentCard(String name, int score) { this.name = name; this.score = score; }
  @Override public String toString() { return ""; }
}` },
    solution: { java: `class StudentCard {
  private String name; private int score;
  StudentCard(String name, int score) { this.name = name; this.score = score; }
  @Override public String toString() { return name + ":" + score + "점"; }
}` },
    explain: '`println(객체)`는 객체의 `toString()` 결과를 출력합니다.', hints: ['`toString()`의 반환형은 `String`입니다.', '이름, 콜론, 점수, `점`을 이어 붙이세요.'],
  },
  {
    id: 'java-shape-polymorphism', title: '여러 도형의 넓이 합', level: 3,
    topics: ['상속', '클래스'], langs: ['java'], chapter: { java: 'inherit' },
    statement: '한 그림에 정사각형과 직각삼각형이 섞여 있습니다. `Shape`를 상속한 `Square`와 `Triangle`이 각각 `area()`를 재정의하게 하세요. 정사각형 넓이는 변×변, 삼각형 넓이는 밑변×높이÷2이며 입력은 정수 넓이가 되도록 주어집니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스들**입니다.',
    inputSpec: '첫 줄 `n`(1~20). 다음 `n`줄은 `S 변` 또는 `T 밑변 높이`입니다. 길이는 1~100입니다.', outputSpec: '도형 전체의 넓이 합을 정수로 출력합니다.',
    examples: [{ stdin: '3\nS 3\nT 4 2\nS 2\n', expected: '17\n', explain: '9+4+4=17입니다.' }, { stdin: '2\nS 2\nT 6 2\n', expected: '10\n', explain: '정사각형 넓이 4와 삼각형 넓이 6을 더합니다.' }],
    tests: [{ stdin: '1\nS 1\n', expected: '1\n' }, { stdin: '1\nT 10 6\n', expected: '30\n' }, { stdin: '4\nT 2 2\nS 5\nT 8 4\nS 1\n', expected: '44\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in); int n = sc.nextInt(); int total = 0;
    for (int i = 0; i < n; i++) {
      Shape shape;
      if (sc.next().equals("S")) shape = new Square(sc.nextInt());
      else shape = new Triangle(sc.nextInt(), sc.nextInt());
      total += shape.area();
    }
    System.out.println(total);
  }
}` },
    starter: { java: `class Shape { int area() { return 0; } }
class Square extends Shape {
  private int side;
  Square(int side) { this.side = side; }
  @Override int area() { return 0; }
}
class Triangle extends Shape {
  private int base, height;
  Triangle(int base, int height) { this.base = base; this.height = height; }
  @Override int area() { return 0; }
}` },
    solution: { java: `class Shape { int area() { return 0; } }
class Square extends Shape {
  private int side;
  Square(int side) { this.side = side; }
  @Override int area() { return side * side; }
}
class Triangle extends Shape {
  private int base, height;
  Triangle(int base, int height) { this.base = base; this.height = height; }
  @Override int area() { return base * height / 2; }
}` },
    explain: '`Shape` 변수는 서로 다른 자식 객체를 담고, 호출된 `area()`는 실제 객체의 구현을 따릅니다.', hints: ['두 자식 클래스 모두 `Shape`를 상속합니다.', '각 `area()`에서 자신의 필드로 넓이를 구하세요.'],
  },
  {
    id: 'java-delivery-interface', title: '배달비 규칙을 인터페이스로', level: 3,
    topics: ['클래스', '상속'], langs: ['java'], chapter: { java: 'inherit' },
    statement: '배달 방식마다 요금 계산이 다릅니다. `DeliveryFee` 인터페이스를 구현하는 `BikeFee`, `CarFee`를 작성하세요. 자전거는 거리×2, 자동차는 기본 5+거리×3입니다. 학생 코드는 제공된 인터페이스 뒤, `Main` 앞에 들어가는 **public이 아닌 최상위 클래스들**입니다.',
    inputSpec: '첫 줄에 방식 `B` 또는 `C`와 거리(0~100)가 주어집니다.', outputSpec: '배달비 정수 한 개를 출력합니다.',
    examples: [{ stdin: 'B 4\n', expected: '8\n', explain: '자전거는 4×2입니다.' }, { stdin: 'C 2\n', expected: '11\n', explain: '자동차 기본요금 5에 거리 요금 2×3을 더합니다.' }],
    tests: [{ stdin: 'C 4\n', expected: '17\n' }, { stdin: 'B 0\n', expected: '0\n' }, { stdin: 'C 0\n', expected: '5\n' }, { stdin: 'C 10\n', expected: '35\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
interface DeliveryFee { int cost(int distance); }
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    DeliveryFee fee = sc.next().equals("B") ? new BikeFee() : new CarFee();
    System.out.println(fee.cost(sc.nextInt()));
  }
}` },
    starter: { java: `class BikeFee implements DeliveryFee {
  public int cost(int distance) { return 0; }
}
class CarFee implements DeliveryFee {
  public int cost(int distance) { return 0; }
}` },
    solution: { java: `class BikeFee implements DeliveryFee {
  public int cost(int distance) { return distance * 2; }
}
class CarFee implements DeliveryFee {
  public int cost(int distance) { return 5 + distance * 3; }
}` },
    explain: '두 클래스가 같은 `cost` 약속을 지키므로 호출부는 방식에 관계없이 계산할 수 있습니다.', hints: ['`implements DeliveryFee`와 `public int cost`가 필요합니다.', '자동차의 기본요금 5는 거리 0에도 적용됩니다.'],
  },
  {
    id: 'java-word-hashmap', title: 'HashMap 단어 빈도', level: 3,
    topics: ['딕셔너리', '문자열'], langs: ['java'], chapter: { java: 'project' },
    statement: '스터디 회의록에 특정 단어가 몇 번 나왔는지 세세요. `HashMap<String, Integer>`로 각 단어의 횟수를 관리합니다. 대소문자는 서로 다른 단어입니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `WordCounter`입니다.',
    inputSpec: '첫 줄 `n`(1~30), 다음 줄에 공백 없는 단어 `n`개, 마지막 줄에 찾을 단어 하나. 각 단어는 영문 1~20자입니다.', outputSpec: '찾을 단어의 등장 횟수를 출력합니다. 없으면 0입니다.',
    examples: [{ stdin: '5\njava c java python java\njava\n', expected: '3\n', explain: '`java`가 세 번 나옵니다.' }, { stdin: '3\na b a\nb\n', expected: '1\n', explain: '찾는 단어 b가 한 번만 등장합니다.' }],
    tests: [{ stdin: '3\na b c\nz\n', expected: '0\n' }, { stdin: '4\nA a A a\nA\n', expected: '2\n' }, { stdin: '1\nhello\nhello\n', expected: '1\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in); int n = sc.nextInt();
    String[] words = new String[n];
    for (int i = 0; i < n; i++) words[i] = sc.next();
    System.out.println(WordCounter.count(words, sc.next()));
  }
}` },
    starter: { java: `class WordCounter {
  static int count(String[] words, String target) { return 0; }
}` },
    solution: { java: `class WordCounter {
  static int count(String[] words, String target) {
    Map<String, Integer> counts = new HashMap<>();
    for (String word : words) counts.put(word, counts.getOrDefault(word, 0) + 1);
    return counts.getOrDefault(target, 0);
  }
}` },
    explain: '`getOrDefault`로 아직 없는 단어를 0회로 취급해 빈도를 누적합니다.', hints: ['단어를 키로, 횟수를 값으로 저장하세요.', '`getOrDefault(word, 0) + 1`을 사용하세요.'],
  },
  {
    id: 'java-safe-integer', title: '잘못된 정수 입력 다루기', level: 3,
    topics: ['예외', '문자열'], langs: ['java'], chapter: { java: 'exception' },
    statement: '입력 한 줄을 정수로 바꾸어 두 배를 출력하세요. 정수가 아니거나 범위 밖이면 프로그램을 멈추지 말고 정확히 `오류`를 돌려줍니다. `Integer.parseInt`와 `try/catch`를 사용하세요. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `SafeInteger`입니다.',
    inputSpec: '공백 없는 문자열 한 줄(1~20자). 유효한 정수의 절댓값은 10000 이하입니다.', outputSpec: '유효하면 두 배 한 줄, 아니면 `오류` 한 줄입니다.',
    examples: [{ stdin: '12\n', expected: '24\n', explain: '12의 두 배입니다.' }, { stdin: 'abc\n', expected: '오류\n', explain: 'abc는 정수로 바꿀 수 없어 예외를 잡고 오류를 반환합니다.' }],
    tests: [{ stdin: 'abc\n', expected: '오류\n' }, { stdin: '-5\n', expected: '-10\n' }, { stdin: '2147483648\n', expected: '오류\n' }, { stdin: '0\n', expected: '0\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.println(SafeInteger.twice(sc.next()));
  }
}` },
    starter: { java: `class SafeInteger {
  static String twice(String input) { return "오류"; }
}` },
    solution: { java: `class SafeInteger {
  static String twice(String input) {
    try {
      int value = Integer.parseInt(input);
      // 문제에서 정한 입력 범위도 함께 확인한다.
      if (Math.abs((long) value) > 10000) return "오류";
      return String.valueOf(value * 2);
    } catch (NumberFormatException e) {
      return "오류";
    }
  }
}` },
    explain: '`parseInt`가 실패하면 `NumberFormatException`이 발생합니다. 숫자로 바뀌어도 허용 범위를 확인합니다.', hints: ['변환 코드를 `try` 안에 두세요.', '`catch (NumberFormatException e)`에서 `오류`를 반환하세요.'],
  },
  {
    id: 'java-stringbuilder-chain', title: 'StringBuilder로 이름표 만들기', level: 2,
    topics: ['문자열', '클래스'], langs: ['java'], chapter: { java: 'method' },
    statement: '여러 팀원의 이름을 `이름-이름-이름` 형태의 이름표로 이어 붙입니다. `StringBuilder`를 사용하고 맨 뒤에는 하이픈을 붙이지 마세요. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `NameTag`입니다.',
    inputSpec: '첫 줄 이름 수 `n`(1~30), 다음 줄에 공백 없는 이름 `n`개(각 1~20자).', outputSpec: '이름들을 입력 순서대로 하이픈으로 연결해 출력합니다.',
    examples: [{ stdin: '3\n민수 지은 하늘\n', expected: '민수-지은-하늘\n', explain: '이름 사이에만 하이픈 두 개가 들어갑니다.' }, { stdin: '2\nA B\n', expected: 'A-B\n', explain: '두 이름 사이에만 하이픈 한 개를 넣습니다.' }],
    tests: [{ stdin: '1\nA\n', expected: 'A\n' }, { stdin: '2\na b\n', expected: 'a-b\n' }, { stdin: '4\nx y z w\n', expected: 'x-y-z-w\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in); int n = sc.nextInt();
    String[] names = new String[n];
    for (int i = 0; i < n; i++) names[i] = sc.next();
    System.out.println(NameTag.join(names));
  }
}` },
    starter: { java: `class NameTag {
  static String join(String[] names) { return ""; }
}` },
    solution: { java: `class NameTag {
  static String join(String[] names) {
    StringBuilder result = new StringBuilder();
    for (int i = 0; i < names.length; i++) {
      if (i > 0) result.append('-');
      result.append(names[i]);
    }
    return result.toString();
  }
}` },
    explain: '두 번째 이름부터 앞에 구분자를 넣으면 마지막에 불필요한 하이픈이 남지 않습니다.', hints: ['`StringBuilder`를 먼저 만드세요.', '`i > 0`일 때 구분자를 추가하세요.'],
  },
  {
    id: 'java-season-enum', title: 'enum으로 계절 이름 정하기', level: 3,
    topics: ['클래스', '조건문'], langs: ['java'], chapter: { java: 'project' },
    statement: '계절 코드를 한국어 이름으로 바꾸세요. `Season` enum에 `SPRING`, `SUMMER`, `AUTUMN`, `WINTER`를 선언하고 인스턴스 메서드 `korean()`을 만드세요. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 enum**입니다.',
    inputSpec: '네 영문 코드 중 하나가 대문자로 주어집니다.', outputSpec: '각각 `봄`, `여름`, `가을`, `겨울` 중 하나를 출력합니다.',
    examples: [{ stdin: 'SPRING\n', expected: '봄\n', explain: 'SPRING은 봄입니다.' }, { stdin: 'WINTER\n', expected: '겨울\n', explain: 'WINTER 상수에 저장된 한국어 이름은 겨울입니다.' }],
    tests: [{ stdin: 'SUMMER\n', expected: '여름\n' }, { stdin: 'AUTUMN\n', expected: '가을\n' }, { stdin: 'WINTER\n', expected: '겨울\n' }],
    mode: 'function',
    harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.println(Season.valueOf(sc.next()).korean());
  }
}` },
    starter: { java: `enum Season {
  SPRING, SUMMER, AUTUMN, WINTER;
  String korean() { return ""; }
}` },
    solution: { java: `enum Season {
  SPRING("봄"), SUMMER("여름"), AUTUMN("가을"), WINTER("겨울");
  private final String label;
  Season(String label) { this.label = label; }
  String korean() { return label; }
}` },
    explain: '각 enum 상수에 한국어 이름을 저장해 두면 조건문 없이 대응하는 이름을 돌려줄 수 있습니다.', hints: ['각 상수를 `SPRING("봄")`처럼 선언하세요.', '생성자에서 전달된 이름을 필드에 저장하세요.'],
  },
  {
    id: 'java-array-first', title: '첫 번째 출석 번호', level: 1,
    topics: ['배열'], langs: ['java'], chapter: { java: 'array' },
    statement: '출석 번호를 입력 순서대로 배열에 담습니다. 첫 번째 번호를 찾아 출력하세요.\n\n**조건:** 번호는 -1000~1000이며 적어도 한 개가 주어집니다.',
    inputSpec: '첫 줄에 번호 수 `n`(1~20), 둘째 줄에 정수 `n`개가 공백으로 주어집니다.', outputSpec: '배열의 첫 번째 번호 한 개를 출력합니다.',
    examples: [{ stdin: '3\n8 2 7\n', expected: '8\n', explain: '배열의 첫 칸에는 처음 읽은 8이 저장됩니다.' }, { stdin: '1\n-4\n', expected: '-4\n', explain: '번호가 하나뿐이라 첫 번호도 -4입니다.' }],
    tests: [{ stdin: '2\n0 5\n', expected: '0\n' }, { stdin: '4\n9 8 7 6\n', expected: '9\n' }, { stdin: '3\n-1000 0 1000\n', expected: '-1000\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 정수를 배열에 저장하고 첫 칸을 출력하세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    int[] numbers = new int[n];
    for (int i = 0; i < n; i++) numbers[i] = sc.nextInt();
    System.out.println(numbers[0]);
  }
}` },
    explain: '배열의 인덱스는 0부터 시작하므로 첫 값은 `numbers[0]`입니다.', hints: ['크기가 `n`인 `int[]`를 만드세요.', '첫 칸의 인덱스는 0입니다.'],
  },
  {
    id: 'java-class-name-card', title: '이름을 기억하는 카드', level: 1,
    topics: ['클래스'], langs: ['java'], chapter: { java: 'class' },
    statement: '동아리원 카드가 이름을 한 번 저장하고 다시 알려주게 하세요. 생성자에서 이름을 받아 필드에 넣고 `name()`에서 돌려줍니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `NameCard`입니다.\n\n**조건:** 이름은 공백 없는 영문 1~20자입니다.',
    inputSpec: '한 줄에 이름 한 개가 주어집니다.', outputSpec: '저장한 이름을 한 줄에 출력합니다.',
    examples: [{ stdin: 'Mina\n', expected: 'Mina\n', explain: '생성자가 Mina를 저장하고 메서드가 그대로 돌려줍니다.' }, { stdin: 'Jin\n', expected: 'Jin\n', explain: '이름 필드에 Jin을 저장했으므로 Jin이 출력됩니다.' }],
    tests: [{ stdin: 'A\n', expected: 'A\n' }, { stdin: 'Coms\n', expected: 'Coms\n' }, { stdin: 'Java\n', expected: 'Java\n' }],
    mode: 'function', harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.println(new NameCard(sc.next()).name());
  }
}` },
    starter: { java: `class NameCard {
  private String value;
  NameCard(String name) { value = ""; }
  String name() { return value; }
}` },
    solution: { java: `class NameCard {
  private String value;
  NameCard(String name) { value = name; }
  String name() { return value; }
}` },
    explain: '객체의 필드는 생성자로 받은 값을 이후 메서드 호출까지 기억합니다.', hints: ['생성자의 `name`을 필드에 저장하세요.', '`name()`은 필드를 반환합니다.'],
  },
  {
    id: 'java-inherit-greeting', title: '상속한 인사말 바꾸기', level: 1,
    topics: ['상속', '클래스'], langs: ['java'], chapter: { java: 'inherit' },
    statement: '기본 인사 객체를 상속한 동아리 인사 객체가 자기 문구를 돌려주게 하세요. `ClubGreeting`의 `message()`를 재정의합니다. 학생 코드는 제공된 `Greeting` 뒤, `Main` 앞의 **public이 아닌 최상위 클래스**입니다.\n\n**조건:** 이름은 공백 없는 영문 1~20자입니다.',
    inputSpec: '한 줄에 이름 한 개가 주어집니다.', outputSpec: '`이름님, 환영합니다`를 한 줄에 출력합니다.',
    examples: [{ stdin: 'Mina\n', expected: 'Mina님, 환영합니다\n', explain: '자식 클래스의 메서드가 Mina를 넣어 새 인사를 만듭니다.' }, { stdin: 'Jin\n', expected: 'Jin님, 환영합니다\n', explain: '같은 메서드에 Jin을 전달하면 이름 부분만 달라집니다.' }],
    tests: [{ stdin: 'A\n', expected: 'A님, 환영합니다\n' }, { stdin: 'Coms\n', expected: 'Coms님, 환영합니다\n' }, { stdin: 'Java\n', expected: 'Java님, 환영합니다\n' }],
    mode: 'function', harness: { java: `import java.util.*;
class Greeting { String message(String name) { return "안녕"; } }
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    Greeting greeting = new ClubGreeting();
    System.out.println(greeting.message(sc.next()));
  }
}` },
    starter: { java: `class ClubGreeting extends Greeting {
  @Override String message(String name) { return ""; }
}` },
    solution: { java: `class ClubGreeting extends Greeting {
  @Override String message(String name) { return name + "님, 환영합니다"; }
}` },
    explain: '부모형 변수로 호출해도 실제 자식 객체의 재정의한 메서드가 실행됩니다.', hints: ['`extends Greeting`을 유지하세요.', '`message`에서 이름과 인사말을 이어 반환하세요.'],
  },
  {
    id: 'java-exception-fallback', title: '없는 번호를 읽었을 때', level: 1,
    topics: ['예외', '배열'], langs: ['java'], chapter: { java: 'exception' },
    statement: '준비물 번호로 배열에서 물건을 찾습니다. 번호가 범위를 벗어나면 프로그램이 멈추는 대신 `없음`을 출력하세요. 배열 접근을 `try/catch`로 처리합니다. 학생 코드는 `Main` 앞의 **public이 아닌 최상위 클래스** `ItemLookup`입니다.\n\n**조건:** 번호는 -5~10입니다.',
    inputSpec: '한 줄에 찾을 배열 인덱스가 주어집니다.', outputSpec: '인덱스 0, 1, 2면 각각 `노트`, `펜`, `가방`을 출력하고, 그 밖에는 `없음`을 출력합니다.',
    examples: [{ stdin: '1\n', expected: '펜\n', explain: '인덱스 1은 두 번째 물건인 펜을 가리킵니다.' }, { stdin: '3\n', expected: '없음\n', explain: '배열은 인덱스 2까지만 있으므로 예외를 잡아 없음으로 바꿉니다.' }],
    tests: [{ stdin: '0\n', expected: '노트\n' }, { stdin: '2\n', expected: '가방\n' }, { stdin: '-1\n', expected: '없음\n' }, { stdin: '10\n', expected: '없음\n' }],
    mode: 'function', harness: { java: `import java.util.*;
/*@USER@*/
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.println(ItemLookup.find(sc.nextInt()));
  }
}` },
    starter: { java: `class ItemLookup {
  static String find(int index) { return "없음"; }
}` },
    solution: { java: `class ItemLookup {
  static String find(int index) {
    String[] items = {"노트", "펜", "가방"};
    try {
      return items[index];
    } catch (ArrayIndexOutOfBoundsException e) {
      return "없음";
    }
  }
}` },
    explain: '유효한 인덱스는 배열 값을 반환하고, 범위를 벗어난 접근만 예외 처리합니다.', hints: ['배열 접근을 `try` 안에 두세요.', '`ArrayIndexOutOfBoundsException`을 잡으세요.'],
  },
  {
    id: 'java-project-ticket-balance', title: '행사 입장권 정산', level: 1,
    topics: ['시뮬레이션', '수학'], langs: ['java'], chapter: { java: 'project' },
    statement: '작은 행사에서 입장권을 팔고 비용을 냅니다. 판매 수입을 계산한 다음 비용을 빼 남은 금액을 구하세요. 한 행사의 두 단계를 순서대로 처리합니다.\n\n**조건:** 장수는 0~100, 가격과 비용은 각각 0~10000원입니다. 남은 금액은 음수여도 됩니다.',
    inputSpec: '한 줄에 판매 장수, 장당 가격, 행사 비용이 순서대로 주어집니다.', outputSpec: '정산 후 남은 금액 한 개를 출력합니다.',
    examples: [{ stdin: '3 5000 4000\n', expected: '11000\n', explain: '수입 15000원에서 비용 4000원을 빼 11000원입니다.' }, { stdin: '1 1000 3000\n', expected: '-2000\n', explain: '수입 1000원이 비용보다 적어 -2000원입니다.' }],
    tests: [{ stdin: '0 100 0\n', expected: '0\n' }, { stdin: '100 10000 10000\n', expected: '990000\n' }, { stdin: '2 5 10\n', expected: '0\n' }],
    mode: 'stdio', starter: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    // 판매 수입을 구한 뒤 비용을 빼세요.
  }
}` },
    solution: { java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int count = sc.nextInt(), price = sc.nextInt(), cost = sc.nextInt();
    int revenue = count * price;
    System.out.println(revenue - cost);
  }
}` },
    explain: '장수와 가격으로 수입을 먼저 계산한 뒤 행사 비용을 차감합니다.', hints: ['수입은 `장수 × 가격`입니다.', '수입에서 비용을 빼세요.'],
  },
]

export default java
